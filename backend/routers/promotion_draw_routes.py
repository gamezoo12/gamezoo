from datetime import datetime, timezone
import hashlib,hmac,json,secrets
from fastapi import APIRouter,HTTPException,Request
from auth import require_admin
from deps import get_db
from routers.wallet_routes import _apply_tx_idempotent
router=APIRouter(prefix='/api/admin/promotion',tags=['admin-promotion-draw']);RNG_ALGORITHM='HMAC-SHA256 rejection-sampling v1'
def _utc(value):
 if not value:return None
 try:
  dt=datetime.fromisoformat(str(value).replace('Z','+00:00'));return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
 except ValueError:return None
async def _cfg(db):
 doc=await db.promotion_config.find_one({'key':'freeworld'},{'_id':0}) or {};return {'promotion_id':doc.get('promotion_id','freeworld-2026-01'),'name':doc.get('name','Free World Promotion'),'winner_count':max(1,int(doc.get('winner_count',2))),'prize_per_winner_gbp':float(doc.get('prize_per_winner_gbp',500)),'end_at':doc.get('end_at'),'active':bool(doc.get('active'))}
async def _eligible_snapshot(db,pid):
 tickets=await db.promotion_tickets.find({'promotion_id':pid},{'_id':0,'ticket_number':1,'user_id':1,'source':1,'referred_user_id':1,'created_at':1}).sort([('ticket_number',1)]).to_list(1000000);return[t for t in tickets if t.get('ticket_number') and t.get('user_id')]
def _snapshot_hash(tickets):return hashlib.sha256(json.dumps([{'ticket_number':t['ticket_number'],'user_id':t['user_id']} for t in tickets],sort_keys=True,separators=(',',':')).encode()).hexdigest()
def _randbelow(seed,counter,n):
 if n<=0:raise ValueError('n must be positive')
 limit=(1<<256)-((1<<256)%n)
 while True:
  digest=hmac.new(seed,counter.to_bytes(16,'big'),hashlib.sha256).digest();counter+=1;x=int.from_bytes(digest,'big')
  if x<limit:return x%n,counter
def _select_distinct_users(tickets,count,seed):
 pool=list(tickets);winners=[];counter=0
 while pool and len(winners)<count:
  idx,counter=_randbelow(seed,counter,len(pool));pick=pool[idx];winners.append(pick);pool=[t for t in pool if t['user_id']!=pick['user_id']]
 return winners,counter
@router.get('/draw')
async def draw_status(request:Request):
 await require_admin(request);db=get_db();cfg=await _cfg(db);pid=cfg['promotion_id'];existing=await db.promotion_draws.find_one({'promotion_id':pid},{'_id':0});tickets=await _eligible_snapshot(db,pid);unique_users=len({t['user_id'] for t in tickets});end_at=_utc(cfg.get('end_at'));now=datetime.now(timezone.utc);return {'promotion':cfg,'drawn':bool(existing),'draw':existing,'rng_algorithm':RNG_ALGORITHM,'eligible_ticket_count':len(tickets),'eligible_user_count':unique_users,'can_draw':bool(not existing and end_at and now>=end_at and unique_users>=cfg['winner_count']),'blocked_reason':('Draw already completed.' if existing else 'Promotion end date is not configured.' if not end_at else 'Promotion has not ended yet.' if now<end_at else 'Not enough unique eligible users.' if unique_users<cfg['winner_count'] else None)}
@router.post('/draw')
async def run_draw(request:Request):
 admin=await require_admin(request);db=get_db();cfg=await _cfg(db);pid=cfg['promotion_id'];now=datetime.now(timezone.utc)
 if await db.promotion_draws.find_one({'promotion_id':pid},{'_id':1}):raise HTTPException(409,'This promotion has already been drawn.')
 end_at=_utc(cfg.get('end_at'))
 if not end_at or now<end_at:raise HTTPException(400,'Winners can only be drawn after the promotion end date.')
 tickets=await _eligible_snapshot(db,pid);unique_users=len({t['user_id'] for t in tickets});count=cfg['winner_count']
 if unique_users<count:raise HTTPException(400,f'Need at least {count} unique eligible users.')
 snapshot_sha=_snapshot_hash(tickets);seed=secrets.token_bytes(32);winners,rng_iterations=_select_distinct_users(tickets,count,seed);enriched=[]
 for place,ticket in enumerate(winners,1):
  user=await db.users.find_one({'user_id':ticket['user_id']},{'_id':0,'user_id':1,'public_id':1,'name':1,'username':1,'email':1}) or {'user_id':ticket['user_id']};enriched.append({'place':place,'user_id':ticket['user_id'],'ticket_number':ticket['ticket_number'],'ticket_source':ticket.get('source'),'prize_gbp':cfg['prize_per_winner_gbp'],'user':user,'verification_status':'pending','payment_status':'pending','verified_at':None,'verified_by_user_id':None,'paid_at':None,'paid_by_user_id':None,'wallet_transaction_ref':None})
 actor=admin if isinstance(admin,dict) else {};draw={'promotion_id':pid,'promotion_name':cfg['name'],'drawn_at':now,'drawn_by_user_id':actor.get('user_id'),'winner_count':count,'prize_per_winner_gbp':cfg['prize_per_winner_gbp'],'eligible_ticket_count':len(tickets),'eligible_user_count':unique_users,'ticket_snapshot_sha256':snapshot_sha,'rng_algorithm':RNG_ALGORITHM,'rng_seed_hex':seed.hex(),'rng_seed_sha256':hashlib.sha256(seed).hexdigest(),'rng_iterations':rng_iterations,'winners':enriched,'status':'completed'}
 try:await db.promotion_draws.insert_one(draw)
 except Exception:
  if await db.promotion_draws.find_one({'promotion_id':pid},{'_id':1}):raise HTTPException(409,'This promotion has already been drawn.')
  raise
 draw.pop('_id',None);return draw
@router.post('/draw/winners/{place}/verify')
async def verify_winner(place:int,request:Request):
 admin=await require_admin(request);db=get_db();cfg=await _cfg(db);pid=cfg['promotion_id'];draw=await db.promotion_draws.find_one({'promotion_id':pid},{'_id':0})
 if not draw:raise HTTPException(404,'Draw not found.')
 winner=next((w for w in draw.get('winners',[]) if int(w.get('place',0))==place),None)
 if not winner:raise HTTPException(404,'Winner not found.')
 if winner.get('payment_status')=='paid':raise HTTPException(409,'Winner has already been paid.')
 actor=admin if isinstance(admin,dict) else {};now=datetime.now(timezone.utc);await db.promotion_draws.update_one({'promotion_id':pid,'winners':{'$elemMatch':{'place':place,'payment_status':{'$ne':'paid'}}}},{'$set':{'winners.$.verification_status':'verified','winners.$.verified_at':now,'winners.$.verified_by_user_id':actor.get('user_id')}});return {'ok':True,'status':'verified'}
@router.post('/draw/winners/{place}/paid')
async def mark_winner_paid(place:int,request:Request):
 admin=await require_admin(request);db=get_db();cfg=await _cfg(db);pid=cfg['promotion_id'];draw=await db.promotion_draws.find_one({'promotion_id':pid},{'_id':0})
 if not draw:raise HTTPException(404,'Draw not found.')
 winner=next((w for w in draw.get('winners',[]) if int(w.get('place',0))==place),None)
 if not winner:raise HTTPException(404,'Winner not found.')
 if winner.get('verification_status')!='verified':raise HTTPException(400,'Verify the winner before marking paid.')
 ref=f'promotion:{pid}:winner:{place}';amount=round(float(winner.get('prize_gbp',0)),2);tx=await _apply_tx_idempotent(db,winner['user_id'],'promo_bonus',amount,note=f'{cfg["name"]} Winner #{place} prize',ref_order_id=ref);actor=admin if isinstance(admin,dict) else {};now=datetime.now(timezone.utc);await db.promotion_draws.update_one({'promotion_id':pid,'winners.place':place},{'$set':{'winners.$.payment_status':'paid','winners.$.paid_at':now,'winners.$.paid_by_user_id':actor.get('user_id'),'winners.$.wallet_transaction_ref':ref}});return {'ok':True,'status':'paid','tokens_credited':amount,'wallet_transaction_ref':ref,'balance':tx.get('balance')}
@router.get('/draw/history')
async def draw_history(request:Request):
 await require_admin(request);db=get_db();items=await db.promotion_draws.find({}, {'_id':0}).sort('drawn_at',-1).limit(100).to_list(100);return {'items':items,'count':len(items)}
from routers.promotion_source_analytics_routes import router as source_analytics_router
router.include_router(source_analytics_router)
