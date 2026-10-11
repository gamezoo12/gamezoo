"""Patch existing Prize League User 360 backend/frontend without replacing other features.
Run at repository root: python apply_user360_email.py
"""
from pathlib import Path
import re

root = Path(__file__).resolve().parent
if not (root / 'backend/routers/user360_routes.py').exists():
    root = Path.cwd()
backend = root / 'backend/routers/user360_routes.py'
if not backend.exists():
    raise SystemExit('Run from project root (backend/routers/user360_routes.py not found).')
src = backend.read_text()
marker = '# User 360 Email Marketing consent (admin, consent-evidence required)'
if marker not in src:
    endpoint = '''

# User 360 Email Marketing consent (admin, consent-evidence required)
class AdminEmailConsentRequest(BaseModel):
    consent: bool
    evidence: Optional[str] = None


@router.post('/{user_id}/email-consent')
async def admin_set_email_consent(user_id: str, payload: AdminEmailConsentRequest, request: Request):
    admin = await require_admin(request)
    if payload.consent and (not payload.evidence or len(payload.evidence.strip()) < 10):
        raise HTTPException(400, 'Record how and when the user agreed to marketing emails (at least 10 characters).')
    from deps import get_db
    db = get_db()
    user = await db.users.find_one({'user_id': user_id}, {'_id': 0, 'erased': 1, 'email': 1})
    if not user:
        raise HTTPException(404, 'User not found')
    if user.get('erased'):
        raise HTTPException(400, 'Cannot change an erased account')
    if payload.consent and not user.get('email'):
        raise HTTPException(400, 'User has no email address')
    now = datetime.now(timezone.utc)
    changes = {
        'marketing_email_consent': payload.consent,
        'email_marketing_opt_in': payload.consent,
        'marketing_email_consent_at': now,
        'marketing_email_consent_source': 'admin_verified_evidence' if payload.consent else 'admin_revoke',
    }
    if payload.consent:
        changes['marketing_email_unsubscribed'] = False
    else:
        changes['marketing_email_unsubscribed'] = True
        changes['marketing_email_unsubscribed_at'] = now
    await db.users.update_one({'user_id': user_id}, {'$set': changes})
    await db.audit_log.insert_one({
        'audit_id': f'aud_{uuid.uuid4().hex[:12]}',
        'kind': 'admin_email_marketing_consent_change',
        'admin_email': admin.get('email'),
        'admin_user_id': admin.get('user_id'),
        'target_user_id': user_id,
        'consent': payload.consent,
        'evidence': payload.evidence.strip() if payload.consent else None,
        'at': now,
    })
    return {'ok': True, 'marketing_email_consent': payload.consent}
'''
    anchor = "@router.post('/{user_id}/suspend')"
    if anchor not in src:
        raise SystemExit('Backend layout differs; no changes made.')
    src = src.replace(anchor, endpoint + '\n\n' + anchor, 1)
    backend.write_text(src)
    print('Updated', backend)
else:
    print('Backend already updated')

# Insert a standalone control immediately following the existing SMS consent
# control in the User 360 frontend. Only proceed if the markup is recognizable.
front = root / 'frontend/src'
files = list(front.rglob('*.jsx')) if front.exists() else []
found = []
for path in files:
    text = path.read_text()
    if 'sms-consent' in text and 'user360' in text.lower().replace(' ', ''):
        found.append(path)
print('Potential User 360 frontend files:', *found, sep='\n  ')
print('Backend is ready. Add the UI control in your actual User 360 component using the accompanying instructions.')
