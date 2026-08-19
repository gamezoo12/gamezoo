from fastapi import FastAPI, APIRouter
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path

from deps import get_client, get_db

ROOT_DIR = Path(__file__).parent
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# MongoDB connection (owned by deps.py; re-exported for legacy callers)
client = get_client()
db = get_db()


def db_ref():
    """Legacy shim — use `from deps import get_db` in new code."""
    return get_db()


# Create the main app
app = FastAPI(title='Prize League API')

# Basic root
api_router = APIRouter(prefix='/api')


@api_router.get('/')
async def root():
    return {'service': 'gamezoo', 'status': 'ok'}


# ---- Kubernetes health probes -------------------------------------------
# The Emergent K8s cluster probes `GET /health` and `GET /ready` on the
# backend pod directly (no `/api` prefix stripping). If we don't answer
# these at the ROOT path the pod is marked NotReady, nginx sees connection
# refused-style failures, and no client traffic reaches the app.
# Keep these endpoints trivially cheap so a slow DB never fails a probe.
@app.get('/health')
@app.get('/healthz')
async def health():
    return {'status': 'ok'}


@app.get('/ready')
@app.get('/readyz')
async def ready():
    # Do NOT touch the DB here — a transient Mongo blip should not evict the
    # pod. Real DB checks belong in a separate /diagnostics endpoint later.
    return {'status': 'ready'}


# ---- Public diagnostics -------------------------------------------------
# Exposed WITHOUT auth so operators can debug a production outage even when
# login itself is broken. Reveals ONLY safe metadata: which DB name is
# active, whether the Mongo ping succeeds, how many users are visible.
# Never returns credentials, secret values, or full document contents.
@api_router.get('/diagnostics/db')
async def diagnostics_db():
    import os as _os
    from deps import _sanitize_db_name
    raw = _os.environ.get('DB_NAME')
    sanitized = _sanitize_db_name(raw)
    result = {
        'db_name_raw': raw,
        'db_name_sanitized': sanitized,
        'mongo_url_host': None,
        'ping_ok': False,
        'ping_error': None,
        'users_count': None,
        'privileged_users_count': None,
    }
    # Extract just the host from MONGO_URL — never the credentials.
    mongo_url = _os.environ.get('MONGO_URL', '')
    if '@' in mongo_url:
        result['mongo_url_host'] = mongo_url.split('@', 1)[1].split('/', 1)[0]
    elif '://' in mongo_url:
        result['mongo_url_host'] = mongo_url.split('://', 1)[1].split('/', 1)[0]
    try:
        # Cheap round-trip: {ping:1} is a no-auth-required admin command.
        await client.admin.command('ping')
        result['ping_ok'] = True
        _db = get_db()
        result['users_count'] = await _db.users.count_documents({})
        result['privileged_users_count'] = await _db.users.count_documents(
            {'role': {'$in': ['admin', 'super_admin', 'operator', 'support']}}
        )
    except Exception as e:
        result['ping_error'] = f'{type(e).__name__}: {str(e)[:200]}'
    return result


@api_router.get('/diagnostics/find-authorized-db')
async def diagnostics_find_authorized_db():
    """Probe the Mongo cluster to discover which DB names the connection
    user is authorized on. Zero credentials leaked — only reports names.

    This is the escape hatch when a customer sets `DB_NAME` to a value
    their Mongo user can't touch. Instead of guessing or waiting for
    support, they hit this URL and learn the truth in one shot.

    Strategy: try `listDatabases` on admin (may be denied), then blindly
    probe a curated list of plausible names by attempting a cheap count on
    each. Return the ones that succeed.
    """
    from motor.motor_asyncio import AsyncIOMotorClient as _Client
    mongo_url = os.environ.get('MONGO_URL', '')
    result: dict = {
        'listDatabases_ok': False,
        'listDatabases_error': None,
        'listDatabases_result': None,
        'probed': [],
        'authorized_dbs': [],
    }
    _c = _Client(mongo_url, serverSelectionTimeoutMS=5000)
    try:
        # Preferred path — if the user has the readWriteAnyDatabase or
        # listDatabases privilege, we get an exact answer.
        dbs = await _c.admin.command('listDatabases', nameOnly=True)
        result['listDatabases_ok'] = True
        result['listDatabases_result'] = [d.get('name') for d in dbs.get('databases', [])]
    except Exception as e:
        result['listDatabases_error'] = f'{type(e).__name__}: {str(e)[:150]}'

    # Blind probe — try a curated set of plausible names. `count_documents`
    # requires the same privilege login itself would need, so a success
    # here proves the user CAN write there.
    candidates = [
        # Explicit values the user has already tried
        os.environ.get('DB_NAME') or '',
        'contest-arena-16', 'prize_league', 'prizeleague', 'prize-league',
        'gamezoo', 'production', 'main', 'app', 'default',
        # Emergent-managed pattern (app-slug-derived)
        'customer-apps', 'customer_apps',
    ]
    # Deduplicate while preserving order, drop empties.
    seen = set()
    ordered = []
    for c in candidates:
        if c and c not in seen:
            seen.add(c)
            ordered.append(c)

    for name in ordered:
        entry = {'db': name, 'authorized': False, 'error': None}
        try:
            await _c[name].users.estimated_document_count()
            entry['authorized'] = True
            result['authorized_dbs'].append(name)
        except Exception as e:
            entry['error'] = f'{type(e).__name__}: {str(e)[:100]}'
        result['probed'].append(entry)

    _c.close()
    return result


@api_router.get('/public/winners')
async def public_winners(limit: int = 50):
    limit = max(1, min(limit, 200))
    docs = await db.winners.find({}, {'_id': 0}).sort('drawn_at', -1).to_list(limit)
    return docs


@api_router.get('/public/stats')
async def public_stats():
    contests_count = await db.contests.count_documents({'status': 'live'})
    winners_count = await db.winners.count_documents({})
    pp = await db.contests.aggregate([{'$group': {'_id': None, 't': {'$sum': '$prize_amount'}}}]).to_list(1)
    prize_pool = pp[0]['t'] if pp else 0
    paid_pipe = await db.winners.aggregate([{'$group': {'_id': None, 't': {'$sum': '$prize_amount'}}}]).to_list(1)
    prizes_given = paid_pipe[0]['t'] if paid_pipe else 0
    return {
        'contests_live': contests_count,
        'winners_total': winners_count,
        'prize_pool': prize_pool,
        'prizes_given': prizes_given,
    }


app.include_router(api_router)

# Feature routers
from routers.auth_routes import router as auth_router
from routers.contest_routes import router as contest_router
from routers.order_routes import router as order_router
from routers.admin_routes import router as admin_router
from routers.meera_routes import router as meera_router, public_router as meera_public_router
from routers.user_routes import router as user_router
from routers.settings_routes import router as settings_router, public_router as settings_public_router
from routers.production_routes import production_router, notif_router
from routers.wallet_routes import wallet_router, admin_wallet_router
from routers.referral_routes import router as referral_router
from routers.game_routes import router as game_router, public_router as game_public_router
from routers.payments_routes import payments_router
from routers.uploads_routes import uploads_router
from routers.winners_routes import winners_router
from routers.twilio_routes import router as twilio_router
from routers.captcha_routes import router as captcha_router
from routers.support_routes import router as support_router, admin_router as admin_support_router
from routers.legal_routes import public_router as legal_public_router, admin_router as legal_admin_router, ensure_legal_docs_seeded
from routers.company_routes import public_router as company_public_router, admin_router as company_admin_router, contest_router as leaderboard_router
from routers.engines_routes import router as engines_router, public_router as engines_public_router
from routers.user360_routes import router as user360_router

app.include_router(auth_router)
app.include_router(contest_router)
app.include_router(order_router)
app.include_router(admin_router)
app.include_router(meera_router)
app.include_router(meera_public_router)
app.include_router(user_router)
app.include_router(settings_router)
app.include_router(settings_public_router)
app.include_router(production_router)
app.include_router(notif_router)
app.include_router(wallet_router)
app.include_router(admin_wallet_router)
app.include_router(referral_router)
app.include_router(game_router)
app.include_router(game_public_router)
app.include_router(payments_router)
app.include_router(uploads_router)
app.include_router(winners_router)
app.include_router(twilio_router)
app.include_router(captcha_router)
app.include_router(support_router)
app.include_router(admin_support_router)
app.include_router(legal_public_router)
app.include_router(legal_admin_router)
app.include_router(company_public_router)
app.include_router(company_admin_router)
app.include_router(leaderboard_router)
app.include_router(engines_router)
app.include_router(engines_public_router)
app.include_router(user360_router)


@app.on_event('startup')
async def _seed_legal_docs():
    from deps import get_db
    try:
        await ensure_legal_docs_seeded(get_db())
    except Exception as e:
        import logging
        logging.warning(f'[startup] legal seed failed: {e}')

# Serve uploaded images under /api/uploads/* so k8s ingress routes to the backend pod.
app.mount("/api/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=r'https?://(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|.*\.preview\.emergentagent\.com|prizeleague\.co\.uk|.*\.prizeleague\.co\.uk|.*\.emergent\.host)',
    allow_methods=['*'],
    allow_headers=['*'],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event('startup')
async def _start_scheduler():
    from services import scheduler as draw_scheduler
    draw_scheduler.start(db)
    logger.info('Draw scheduler started')


@app.on_event('startup')
async def _ensure_core_indexes():
    """Create the indexes the app relies on for correctness (not just perf).
    Idempotent — Mongo silently no-ops if the index already exists.

    Critical ones:
      - users.email unique          → prevents duplicate signup for the same email
      - users.public_id unique      → sequential PLxxxxx must be unique
      - orders(user_id, idempotency_sig) unique + short TTL-scoped filter →
        makes the 3-second double-click guard race-safe (duplicate key
        rejection is atomic, unlike the previous check-then-insert)
      - payment_transactions.session_id unique → keeps top-up records unique
      - user_sessions.session_token unique     → Google session integrity
    """
    _db = get_db()
    # Legacy index cleanup — the old `public_id_1` (sparse=True) collides
    # with the new `ux_users_public_id_str` (partialFilterExpression). If we
    # find the legacy sparse variant, drop it silently so the modern one
    # becomes the sole enforcer.
    try:
        existing = await _db.users.list_indexes().to_list(None)
        for idx in existing:
            if idx.get('name') == 'public_id_1' and idx.get('sparse'):
                await _db.users.drop_index('public_id_1')
                logger.info('[startup] dropped legacy sparse index users.public_id_1')
                break
    except Exception as e:
        logger.warning('[startup] legacy index cleanup skipped: %s', str(e)[:120])

    # Each index in its own try — one existing-but-incompatible index must
    # not prevent the others from being created.
    _idx_specs = [
        ('users',                 [('email', 1)],         {'unique': True}),
        ('users',                 [('public_id', 1)],     {'unique': True, 'partialFilterExpression': {'public_id': {'$type': 'string'}}, 'name': 'ux_users_public_id_str'}),
        ('users',                 [('user_id', 1)],       {'unique': True}),
        ('contests',              [('slug', 1)],          {'unique': True, 'sparse': True}),
        ('contests',              [('contest_id', 1)],    {'unique': True}),
        ('orders',                [('order_id', 1)],      {'unique': True}),
        ('orders',                [('user_id', 1), ('idempotency_sig', 1)], {
            'unique': True,
            'partialFilterExpression': {'idempotency_sig': {'$type': 'string'}},
            'name': 'ux_orders_user_idempotency',
        }),
        ('tickets',               [('ticket_id', 1)],     {'unique': True, 'partialFilterExpression': {'ticket_id': {'$type': 'string'}}, 'name': 'ux_tickets_ticket_id_str'}),
        ('payment_transactions',  [('session_id', 1)],    {'unique': True}),
        ('user_sessions',         [('session_token', 1)], {'unique': True}),
        ('wallets',               [('user_id', 1)],       {'unique': True}),
    ]
    ok = 0
    for coll, keys, opts in _idx_specs:
        try:
            await _db[coll].create_index(keys, **opts)
            ok += 1
        except Exception as e:
            logger.warning('[startup] index skip %s%s: %s', coll, keys, str(e)[:120])
    logger.info('[startup] core indexes ensured (%d/%d)', ok, len(_idx_specs))


@app.on_event('shutdown')
async def shutdown_db_client():
    from services import scheduler as draw_scheduler
    draw_scheduler.stop()
    client.close()
