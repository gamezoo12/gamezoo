from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'gamezoo')]


def db_ref():
    """Helper for routers to access db without circular imports."""
    return db


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
from routers.meera_routes import router as meera_router

app.include_router(auth_router)
app.include_router(contest_router)
app.include_router(order_router)
app.include_router(admin_router)
app.include_router(meera_router)


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event('shutdown')
async def shutdown_db_client():
    client.close()
