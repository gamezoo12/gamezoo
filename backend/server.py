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


@app.on_event('shutdown')
async def shutdown_db_client():
    from services import scheduler as draw_scheduler
    draw_scheduler.stop()
    client.close()
