from fastapi import FastAPI, APIRouter
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
import os
import asyncio
import logging
from pathlib import Path
from deps import get_client, get_db
ROOT_DIR=Path(__file__).parent;UPLOAD_DIR=ROOT_DIR/'uploads';UPLOAD_DIR.mkdir(parents=True,exist_ok=True);client=get_client();db=get_db();_bg_tasks:set=set()
def _spawn(coro):
 t=asyncio.create_task(coro);_bg_tasks.add(t);t.add_done_callback(_bg_tasks.discard);return t
def db_ref():return get_db()
app=FastAPI(title='Prize League API');api_router=APIRouter(prefix='/api')
@api_router.get('/')
async def root():return {'service':'gamezoo','status':'ok'}
@app.get('/health')
@app.get('/healthz')
async def health():return {'status':'ok'}
@app.get('/ready')
@app.get('/readyz')
async def ready():return {'status':'ready'}
@api_router.get('/diagnostics/db')
async def diagnostics_db():
 import os as _os
 from deps import _sanitize_db_name
 raw=_os.environ.get('DB_NAME');sanitized=_sanitize_db_name(raw);result={'db_name_raw':raw,'db_name_sanitized':sanitized,'mongo_url_host':None,'ping_ok':False,'ping_error':None,'users_count':None,'privileged_users_count':None};mongo_url=_os.environ.get('MONGO_URL','')
 if '@' in mongo_url:result['mongo_url_host']=mongo_url.split('@',1)[1].split('/',1)[0]
 elif '://' in mongo_url:result['mongo_url_host']=mongo_url.split('://',1)[1].split('/',1)[0]
 try:await client.admin.command('ping');result['ping_ok']=True;_db=get_db();result['users_count']=await _db.users.count_documents({});result['privileged_users_count']=await _db.users.count_documents({'role':{'$in':['admin','super_admin','operator','support']}})
 except Exception as e:result['ping_error']=f'{type(e).__name__}: {str(e)[:200]}'
 return result
@api_router.get('/diagnostics/find-authorized-db')
async def diagnostics_find_authorized_db():
 from motor.motor_asyncio import AsyncIOMotorClient as _Client
 mongo_url=os.environ.get('MONGO_URL','');result={'listDatabases_ok':False,'listDatabases_error':None,'listDatabases_result':None,'probed':[],'authorized_dbs':[]};_c=_Client(mongo_url,serverSelectionTimeoutMS=5000)
 try:dbs=await _c.admin.command('listDatabases',nameOnly=True);result['listDatabases_ok']=True;result['listDatabases_result']=[d.get('name') for d in dbs.get('databases',[])]
 except Exception as e:result['listDatabases_error']=f'{type(e).__name__}: {str(e)[:150]}'
 candidates=[os.environ.get('DB_NAME') or '','contest-arena-16','prize_league','prizeleague','prize-league','gamezoo','production','main','app','default','customer-apps','customer_apps'];seen=set()
 for name in [x for x in candidates if x and not (x in seen or seen.add(x))]:
  entry={'db':name,'authorized':False,'error':None}
  try:await _c[name].users.estimated_document_count();entry['authorized']=True;result['authorized_dbs'].append(name)
  except Exception as e:entry['error']=f'{type(e).__name__}: {str(e)[:100]}'
  result['probed'].append(entry)
 _c.close();return result
@api_router.get('/public/winners')
async def public_winners(limit:int=50):return await db.winners.find({}, {'_id':0}).sort('drawn_at',-1).to_list(max(1,min(limit,200)))
@api_router.get('/public/stats')
async def public_stats():
 contests_count=await db.contests.count_documents({'status':'live'});winners_count=await db.winners.count_documents({});pp=await db.contests.aggregate([{'$group':{'_id':None,'t':{'$sum':'$prize_amount'}}}]).to_list(1);paid=await db.winners.aggregate([{'$group':{'_id':None,'t':{'$sum':'$prize_amount'}}}]).to_list(1);return {'contests_live':contests_count,'winners_total':winners_count,'prize_pool':pp[0]['t'] if pp else 0,'prizes_given':paid[0]['t'] if paid else 0}
app.include_router(api_router)
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
from routers.world_routes import router as world_router, public_router as world_public_router, admin_router as world_admin_router, ensure_world_indexes
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
from routers.acquisition_routes import public_router as acquisition_public_router, admin_router as acquisition_admin_router
from routers.admin_referrals_routes import router as admin_referrals_router
from routers.influencer_promo_routes import router as influencer_promo_router
from routers.winnings_routes import router as winnings_router, admin_router as winnings_admin_router
from routers.cashout_routes import router as cashout_router, admin_router as cashout_admin_router
from routers.promotion_routes import router as promotion_router, admin_router as promotion_admin_router
from routers.promotion_draw_routes import router as promotion_draw_router
from routers.promotion_source_analytics_routes import router as promotion_source_analytics_router
for r in [auth_router,winnings_router,winnings_admin_router,cashout_router,cashout_admin_router,contest_router,order_router,admin_router,meera_router,meera_public_router,user_router,settings_router,settings_public_router,production_router,notif_router,wallet_router,admin_wallet_router,referral_router,game_router,game_public_router,world_router,world_public_router,world_admin_router,payments_router,uploads_router,winners_router,twilio_router,captcha_router,support_router,admin_support_router,legal_public_router,legal_admin_router,company_public_router,company_admin_router,leaderboard_router,engines_router,engines_public_router,user360_router,acquisition_public_router,acquisition_admin_router,admin_referrals_router,influencer_promo_router,promotion_router,promotion_admin_router,promotion_draw_router,promotion_source_analytics_router]:app.include_router(r)
@app.on_event('startup')
async def _ensure_world_engine_indexes():
 async def _bg():
  try:await ensure_world_indexes()
  except Exception as e:logging.warning(f'[startup] world index setup failed: {e}')
 _spawn(_bg())
@app.on_event('startup')
async def _seed_legal_docs():
 async def _bg():
  try:await ensure_legal_docs_seeded(get_db())
  except Exception as e:logging.warning(f'[startup] legal seed failed: {e}')
 _spawn(_bg())
app.mount('/api/uploads',StaticFiles(directory=str(UPLOAD_DIR)),name='uploads');app.add_middleware(CORSMiddleware,allow_credentials=True,allow_origin_regex=r'https?://(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|.*\.preview\.emergentagent\.com|prizeleague\.co\.uk|.*\.prizeleague\.co\.uk|.*\.emergent\.host)',allow_methods=['*'],allow_headers=['*']);logging.basicConfig(level=logging.INFO,format='%(asctime)s - %(name)s - %(levelname)s - %(message)s');logger=logging.getLogger(__name__)
@app.on_event('startup')
async def _start_scheduler():
 from services import scheduler as draw_scheduler
 draw_scheduler.start(db);logger.info('Draw scheduler started')
@app.on_event('startup')
async def _ensure_core_indexes():_spawn(_do_core_indexes())
async def _do_core_indexes():
 _db=get_db();specs=[('users',[('email',1)],{'unique':True}),('users',[('public_id',1)],{'unique':True,'partialFilterExpression':{'public_id':{'$type':'string'}},'name':'ux_users_public_id_str'}),('users',[('user_id',1)],{'unique':True}),('contests',[('slug',1)],{'unique':True,'sparse':True}),('contests',[('contest_id',1)],{'unique':True}),('orders',[('order_id',1)],{'unique':True}),('payment_transactions',[('session_id',1)],{'unique':True}),('user_sessions',[('session_token',1)],{'unique':True}),('wallets',[('user_id',1)],{'unique':True}),('promotion_entries',[('promotion_id',1),('user_id',1)],{'unique':True,'name':'ux_promotion_entry'}),('promotion_tickets',[('ticket_number',1)],{'unique':True}),('promotion_tickets',[('promotion_id',1),('user_id',1),('entitlement_key',1)],{'unique':True,'name':'ux_promotion_ticket_entitlement'}),('promotion_draws',[('promotion_id',1)],{'unique':True,'name':'ux_promotion_draw'})]
 for coll,keys,opts in specs:
  try:await _db[coll].create_index(keys,**opts)
  except Exception as e:logger.warning('[startup] index skip %s%s: %s',coll,keys,str(e)[:120])
@app.on_event('shutdown')
async def shutdown_db_client():
 from services import scheduler as draw_scheduler
 draw_scheduler.stop();client.close()
