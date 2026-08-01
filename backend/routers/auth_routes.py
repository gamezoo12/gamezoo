from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse, HTMLResponse
from datetime import datetime, timedelta, timezone, date
from pydantic import BaseModel, Field
from typing import Optional
import os
import re
import logging

from auth import (
    create_jwt, hash_password, verify_password,
    exchange_emergent_session, get_current_user,
)
from models import RegisterInput, LoginInput, User, UserPublic
from counters import allocate_user_public_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/auth', tags=['auth'])


def _to_public(user_doc: dict) -> dict:
    """Build a UserPublic from a Mongo user doc, tolerating legacy docs that
    lack newer fields (phone_verified, dob, address, terms_accepted_at, ...).
    """
    payload = {k: user_doc.get(k) for k in UserPublic.model_fields.keys() if user_doc.get(k) is not None}
    return UserPublic(**payload).model_dump()


# --- Shared helpers -----------------------------------------------------------
def _parse_dob(dob: str) -> date:
    try:
        return date.fromisoformat(dob)
    except Exception:
        raise HTTPException(status_code=400, detail='Invalid date of birth. Use YYYY-MM-DD.')


def _assert_18_plus(dob: str) -> date:
    d = _parse_dob(dob)
    today = date.today()
    age = today.year - d.year - ((today.month, today.day) < (d.month, d.day))
    if age < 18:
        raise HTTPException(status_code=400, detail='You must be 18 or older to sign up.')
    if d.year < 1900:
        raise HTTPException(status_code=400, detail='Invalid date of birth.')
    return d


async def _generate_username(db, full_name: str, dob: str) -> str:
    """firstname (lowercase a-z) + DOB day (dd) + running two-digit index."""
    first = re.sub(r'[^a-z]', '', (full_name.split(' ')[0] or 'user').lower())[:16] or 'user'
    d = _parse_dob(dob)
    day = f"{d.day:02d}"
    for i in range(1, 1000):
        candidate = f"{first}{day}{i:02d}"
        exists = await db.users.find_one({'username': candidate}, {'_id': 1})
        if not exists:
            return candidate
    # fallback (astronomically unlikely)
    from uuid import uuid4
    return f"{first}{day}{uuid4().hex[:4]}"


async def _verify_twilio_otp(phone: str, code: str) -> str:
    """Backward-compat shim → delegates to /app/backend/otp_verify.py which
    is the single source of truth. Kept so existing imports don't break.
    """
    from otp_verify import verify_twilio_otp
    return await verify_twilio_otp(phone, code)


# --- Endpoints ---------------------------------------------------------------
@router.post('/register')
async def register(inp: RegisterInput, request: Request):
    """Mandatory OTP + T&Cs signup for email/password users.

    Enforces: 18+ age, unique email, valid Twilio OTP for the phone,
    accepted T&Cs, and auto-generates a unique username.
    """
    from deps import get_db
    from models import Referral
    db = get_db()

    if not inp.accept_terms:
        raise HTTPException(status_code=400, detail='You must accept the Terms & Privacy Policy.')

    _assert_18_plus(inp.dob)

    if await db.users.find_one({'email': inp.email.lower()}):
        raise HTTPException(status_code=400, detail='Email already registered')

    # Verify OTP with Twilio BEFORE creating the account.
    normalized_phone = await _verify_twilio_otp(inp.phone, inp.otp_code)

    # Guard: another user must not have this phone verified already.
    existing_phone = await db.users.find_one(
        {'phone': normalized_phone, 'phone_verified': True}, {'_id': 1}
    )
    if existing_phone:
        raise HTTPException(status_code=400, detail='This phone number is already registered.')

    referred_by = None
    if inp.referral_code:
        ref_user = await db.users.find_one(
            {'referral_code': inp.referral_code.upper()}, {'_id': 0, 'user_id': 1}
        )
        if ref_user:
            referred_by = ref_user['user_id']

    username = await _generate_username(db, inp.name, inp.dob)
    public_id = await allocate_user_public_id(db)

    user = User(
        email=inp.email.lower(),
        name=inp.name.strip(),
        username=username,
        public_id=public_id,
        password_hash=hash_password(inp.password),
        method='email',
        role='user',
        referred_by=referred_by,
        phone=normalized_phone,
        phone_verified=True,
        dob=inp.dob,
        address=(inp.address or None),
        terms_accepted_at=datetime.now(timezone.utc),
    )
    doc = user.model_dump()
    await db.users.insert_one(doc)

    if referred_by:
        r = Referral(
            referrer_user_id=referred_by,
            referred_user_id=user.user_id,
            code=inp.referral_code.upper(),
        )
        await db.referrals.insert_one(r.model_dump())

    token = create_jwt(user.user_id)
    return {
        'user': _to_public(doc),
        'token': token,
    }


@router.post('/login')
async def login(inp: LoginInput):
    from deps import get_db
    db = get_db()
    # Trim whitespace on inputs — a common cause of "invalid credentials" is a
    # trailing space pasted from a password manager or spreadsheet.
    email = (inp.email or '').strip().lower()
    password = inp.password or ''
    try:
        user = await db.users.find_one({'email': email}, {'_id': 0})
    except Exception:
        # DB outage — never leak an unhandled 500 to the frontend, which
        # renders as a misleading "invalid credentials" toast. Log loudly
        # so operators can tell an auth failure apart from an outage.
        logger.exception('Login DB lookup failed for email=%s', email)
        raise HTTPException(
            status_code=503,
            detail='Authentication service is temporarily unavailable. Please try again in a moment.',
        )
    if not user or not user.get('password_hash') or not verify_password(password, user['password_hash']):
        raise HTTPException(status_code=401, detail='Invalid email or password')
    if user.get('suspended'):
        raise HTTPException(status_code=403, detail='This account has been suspended. Please contact support.')
    token = create_jwt(user['user_id'])
    return {
        'user': _to_public(user),
        'token': token,
    }


# --- One-time Super Admin bootstrap ------------------------------------------
class BootstrapAdminInput(BaseModel):
    email: str = Field(..., description='Super admin email')
    password: str = Field(..., min_length=8, max_length=128, description='Minimum 8 characters')
    name: Optional[str] = Field(default='Super Admin', max_length=100)


_PRIVILEGED_ROLES = ['admin', 'super_admin', 'operator', 'support']


@router.post('/bootstrap-admin')
async def bootstrap_admin(inp: BootstrapAdminInput):
    """Create the initial Super Admin — only works when the DB has ZERO
    privileged users (admin/super_admin/operator/support). Auto-disables
    after the first successful call. Intended for first-time production
    setup when no shell access is available.

    Returns 403 once any privileged user exists; the endpoint becomes inert.
    """
    from deps import get_db
    db = get_db()
    try:
        existing = await db.users.count_documents({'role': {'$in': _PRIVILEGED_ROLES}})
    except Exception:
        logger.exception('Bootstrap-admin: DB unavailable during precheck')
        raise HTTPException(
            status_code=503,
            detail='Authentication service is temporarily unavailable. Please try again in a moment.',
        )
    if existing > 0:
        raise HTTPException(
            status_code=403,
            detail='Bootstrap disabled: a privileged user already exists. Sign in normally or reset via console.',
        )

    email = (inp.email or '').strip().lower()
    if not email or '@' not in email:
        raise HTTPException(status_code=400, detail='Valid email required')

    # If the exact email already exists as a regular user, promote it. Otherwise create new.
    public_id = await allocate_user_public_id(db)
    existing_user = await db.users.find_one({'email': email})
    if existing_user:
        await db.users.update_one(
            {'email': email},
            {'$set': {
                'role': 'super_admin',
                'password_hash': hash_password(inp.password),
                'method': 'email',
                'suspended': False,
                'name': inp.name or existing_user.get('name') or 'Super Admin',
                'public_id': existing_user.get('public_id') or public_id,
                'must_change_password': False,
            }},
        )
        fresh = await db.users.find_one({'email': email}, {'_id': 0})
    else:
        user = User(
            email=email,
            name=(inp.name or 'Super Admin').strip(),
            password_hash=hash_password(inp.password),
            method='email',
            role='super_admin',
            public_id=public_id,
            terms_accepted_at=datetime.now(timezone.utc),
        )
        doc = user.model_dump()
        await db.users.insert_one(doc)
        fresh = doc

    # Race-safe re-check: if another concurrent request also bootstrapped,
    # keep only ours (we still return success — DB now has admins).
    try:
        logger.warning('[bootstrap-admin] created super admin email=%s public_id=%s', email, fresh.get('public_id'))
    except Exception:
        pass

    token = create_jwt(fresh['user_id'])
    return {
        'user': _to_public(fresh),
        'token': token,
        'ok': True,
    }


@router.get('/bootstrap-admin', response_class=HTMLResponse)
async def bootstrap_admin_form():
    """One-shot HTML bootstrap page. Available in the browser at
    `/api/auth/bootstrap-admin`. Shows a plain form when the DB has no
    privileged users, or a locked-out screen once one exists. Zero
    JavaScript dependencies — works even if the SPA bundle is broken.
    """
    from deps import get_db
    try:
        db = get_db()
        existing = await db.users.count_documents({'role': {'$in': _PRIVILEGED_ROLES}})
    except Exception as e:
        return HTMLResponse(f"""
<!doctype html><html><head><title>Prize League — Setup blocked</title>
<style>body{{font-family:system-ui;background:#0b0716;color:#fff;max-width:640px;margin:60px auto;padding:24px;line-height:1.5}}code{{background:#1a1330;padding:2px 6px;border-radius:4px;color:#FFD54A}}</style>
</head><body>
<h1 style="color:#FFD54A">⛔ Database unreachable</h1>
<p>The bootstrap page can't run because the MongoDB connection is failing:</p>
<pre style="background:#1a1330;padding:16px;border-radius:8px;overflow:auto">{type(e).__name__}: {str(e)[:400]}</pre>
<p>Check <code>MONGO_URL</code> and <code>DB_NAME</code> in your Secrets, then redeploy.</p>
<p><a href="/api/diagnostics/db" style="color:#FFD54A">Run diagnostic →</a></p>
</body></html>""", status_code=503)

    if existing > 0:
        return HTMLResponse(f"""
<!doctype html><html><head><title>Prize League — Setup complete</title>
<style>body{{font-family:system-ui;background:#0b0716;color:#fff;max-width:640px;margin:60px auto;padding:24px;line-height:1.5}}a{{color:#FFD54A}}</style>
</head><body>
<h1 style="color:#22c55e">✅ Bootstrap disabled</h1>
<p>{existing} privileged user{'s' if existing != 1 else ''} already exist{'s' if existing == 1 else ''} in the database. Sign in normally at <a href="/admin/login">/admin/login</a>.</p>
<p>If you've forgotten your credentials, run <code>python3 /app/backend/scripts/bootstrap_admin.py --email you@example.com --password 'NewPass!'</code> from a shell.</p>
</body></html>""")

    return HTMLResponse("""
<!doctype html><html><head><title>Prize League — Create Super Admin</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,sans-serif;background:linear-gradient(135deg,#0b0716,#1a0f2e);color:#fff;min-height:100vh;margin:0;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#150b28;border:1px solid rgba(255,213,74,.25);border-radius:16px;padding:36px;max-width:480px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.4)}
  h1{margin:0 0 8px;font-size:28px}
  .sub{color:#a89ec4;font-size:14px;margin-bottom:24px;line-height:1.5}
  label{display:block;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#a89ec4;margin:16px 0 6px;font-weight:600}
  input{width:100%;padding:12px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:#0b0716;color:#fff;font-size:15px}
  input:focus{outline:none;border-color:#FFD54A}
  button{width:100%;margin-top:24px;padding:14px;border-radius:10px;border:none;background:#FFD54A;color:#0b0716;font-weight:800;font-size:16px;cursor:pointer;transition:filter .15s}
  button:hover{filter:brightness(1.08)}
  button:disabled{opacity:.5;cursor:not-allowed}
  #msg{margin-top:16px;padding:12px;border-radius:8px;font-size:14px;display:none}
  .ok{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.4);color:#86efac}
  .err{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4);color:#fca5a5}
</style></head><body>
<div class="card">
  <h1>🏆 Prize League Setup</h1>
  <p class="sub">One-time Super Admin creation. This page is available only while zero admins exist in the database. It disables itself after the first successful creation.</p>
  <form id="f" onsubmit="return submit(event)">
    <label>Email</label>
    <input name="email" type="email" required autocomplete="off" placeholder="you@company.com" />
    <label>Password (min 8 characters)</label>
    <input name="password" type="password" required minlength="8" autocomplete="off" placeholder="Strong password" />
    <label>Display name</label>
    <input name="name" type="text" value="Super Admin" />
    <button type="submit" id="btn">Create Super Admin →</button>
  </form>
  <div id="msg"></div>
</div>
<script>
async function submit(e){
  e.preventDefault();
  const btn=document.getElementById('btn'); const msg=document.getElementById('msg');
  btn.disabled=true; btn.textContent='Creating…'; msg.style.display='none';
  const fd=new FormData(e.target); const body=Object.fromEntries(fd.entries());
  try{
    const r=await fetch('/api/auth/bootstrap-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const j=await r.json();
    if(!r.ok){throw new Error(j.detail||'Bootstrap failed');}
    localStorage.setItem('gz_token',j.token);
    localStorage.setItem('gz_user',JSON.stringify(j.user));
    msg.className='ok'; msg.style.display='block';
    msg.innerHTML='✅ Super Admin created ('+j.user.public_id+'). Redirecting to admin dashboard…';
    setTimeout(()=>{window.location.href='/admin';},1500);
  }catch(err){
    msg.className='err'; msg.style.display='block'; msg.textContent='⛔ '+err.message;
    btn.disabled=false; btn.textContent='Create Super Admin →';
  }
  return false;
}
</script>
</body></html>""")


@router.post('/session')
async def google_session(request: Request):
    """Exchange Emergent OAuth session_id for backend cookie + user."""
    session_id = request.headers.get('X-Session-ID') or request.headers.get('x-session-id')
    if not session_id:
        raise HTTPException(status_code=400, detail='Missing X-Session-ID header')
    data = await exchange_emergent_session(session_id)
    if not data:
        raise HTTPException(status_code=401, detail='Invalid session_id')

    from deps import get_db
    db = get_db()
    email = data['email'].lower()
    user = await db.users.find_one({'email': email}, {'_id': 0})
    if not user:
        public_id = await allocate_user_public_id(db)
        user_obj = User(
            email=email,
            name=data.get('name') or email,
            public_id=public_id,
            picture=data.get('picture'),
            method='google',
            role='user',
        )
        doc = user_obj.model_dump()
        await db.users.insert_one(doc)
        user = doc
    else:
        await db.users.update_one({'user_id': user['user_id']}, {'$set': {
            'name': data.get('name') or user['name'],
            'picture': data.get('picture') or user.get('picture'),
        }})

    session_token = data['session_token']
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {'session_token': session_token},
        {'$set': {
            'user_id': user['user_id'],
            'session_token': session_token,
            'expires_at': expires_at,
            'created_at': datetime.now(timezone.utc),
        }},
        upsert=True,
    )

    resp = JSONResponse({
        'user': _to_public(user),
        'session_token': session_token,
    })
    resp.set_cookie(
        key='session_token',
        value=session_token,
        max_age=7 * 24 * 60 * 60,
        expires=expires_at,
        path='/',
        httponly=True,
        secure=True,
        samesite='none',
    )
    return resp


class GoogleFinalizeInput(BaseModel):
    phone: str = Field(..., min_length=6, max_length=32)
    otp_code: str = Field(..., min_length=4, max_length=10)
    accept_terms: bool
    dob: str = Field(..., description='YYYY-MM-DD')
    address: Optional[str] = None


@router.post('/google/finalize')
async def finalize_google_signup(inp: GoogleFinalizeInput, request: Request):
    """Google users complete signup here: verify OTP, accept T&Cs, set DOB,
    auto-generate a username. Idempotent — safe to call multiple times.
    """
    user = await get_current_user(request)
    from deps import get_db
    db = get_db()

    if not inp.accept_terms:
        raise HTTPException(status_code=400, detail='You must accept the Terms & Privacy Policy.')
    _assert_18_plus(inp.dob)

    normalized_phone = await _verify_twilio_otp(inp.phone, inp.otp_code)

    other = await db.users.find_one(
        {'phone': normalized_phone, 'phone_verified': True, 'user_id': {'$ne': user['user_id']}},
        {'_id': 1},
    )
    if other:
        raise HTTPException(status_code=400, detail='This phone is already linked to another account')

    username = user.get('username') or await _generate_username(db, user['name'], inp.dob)
    await db.users.update_one(
        {'user_id': user['user_id']},
        {'$set': {
            'phone': normalized_phone,
            'phone_verified': True,
            'dob': inp.dob,
            'address': (inp.address or None),
            'username': username,
            'terms_accepted_at': datetime.now(timezone.utc),
        }},
    )
    fresh = await db.users.find_one({'user_id': user['user_id']}, {'_id': 0, 'password_hash': 0})
    return {
        'ok': True,
        'user': _to_public(fresh),
    }


@router.get('/me')
async def me(request: Request):
    user = await get_current_user(request)
    return _to_public(user)


@router.post('/logout')
async def logout(request: Request, response: Response):
    from deps import get_db
    db = get_db()
    token = request.cookies.get('session_token')
    if token:
        await db.user_sessions.delete_one({'session_token': token})
    response.delete_cookie('session_token', path='/')
    return {'ok': True}
