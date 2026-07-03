from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path

from deps import get_client, get_db

ROOT_DIR = Path(__file__).parent

# MongoDB connection (owned by deps.py; re-exported for legacy callers)
client = get_client()
db = get_db()


def db_ref():
    """Legacy shim — use `from deps import get_db` in new code."""
    return get_db()


# Create the main app
app = FastAPI(title='GameZoo API')

# Basic root
api_router = APIRouter(prefix='/api')


@api_router.get('/')
async def root():
    return {'service': 'gamezoo', 'status': 'ok'}


@api_router.get('/public/winners')
async def public_winners():
    docs = await db.winners.find({}, {'_id': 0}).sort('drawn_at', -1).to_list(200)
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


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=['*'],
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
