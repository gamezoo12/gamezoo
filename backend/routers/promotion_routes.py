from datetime import datetime, timezone
import secrets
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from auth import get_current_user, require_admin
from deps import get_db

router = APIRouter(prefix='/api/promotion', tags=['promotion'])
admin_router = APIRouter(prefix='/api/admin/promotion', tags=['admin-promotion'])
DEFAULT_CONFIG = {'promotion_id':'freeworld-2026-01','name':'Free World Promotion','active':False,'mobile_image_url':'','tablet_image_url':'','desktop_image_url':'','prize_total_gbp':1000,'winner_count':2,'prize_per_winner_gbp':500,'start_at':None,'end_at':None}

def _public_config(doc):
    d={**DEFAULT_CONFIG,**(doc or {})}; d.pop('_id',None); now=datetime.now(timezone.utc); active=bool(d.get('active'))
    for key,is_start in [('start_at',True),('end_at',False)]:
        value=d.get(key)
        if value:
            try:
                dt=datetime.fromisoformat(str(value).replace('Z','+00:00')); dt=dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
                if (is_start and now<dt) or (not is_start and now>=dt): active=False
            except ValueError: pass
    d['is_live']=active; return d

async def _config(db): return _public_config(await db.promotion_config.find_one({'key':'freeworld'},{'_id':0}))
def _ticket_number(): return 'FW-'+secrets.token_hex(5).upper()

async def _issue_ticket(db,promotion_id,user_id,source,referred_user_id=None):
    dedupe={'promotion_id':promotion_id,'user_id':user_id,'source':source}
    if source=='referral': dedupe['referred_user_id']=referred_user_id
    existing=await db.promotion_tickets.find_one(dedupe,{'_id':0})
    if existing: return existing
    doc={**dedupe,'ticket_number':_ticket_number(),'created_at':datetime.now(timezone.utc)}
    await db.promotion_tickets.insert_one(doc); doc.pop('_id',None); return doc

async def _sync_referral_ticket(db,promotion_id,joined_user_id):
    ref=await db.referrals.find_one({'referred_user_id':joined_user_id},{'_id':0,'referrer_user_id':1})
    if not ref or ref.get('referrer_user_id')==joined_user_id: return
    joined=await db.promotion_entries.find_one({'promotion_id':promotion_id,'user_id':ref['referrer_user_id']})
    if joined: await _issue_ticket(db,promotion_id,ref['referrer_user_id'],'referral',joined_user_id)

@router.get('/config')
async def promotion_config(): return await _config(get_db())

@router.get('/me')
async def promotion_me(request:Request):
    user=await get_current_user(request); db=get_db(); cfg=await _config(db); pid=cfg['promotion_id']
    entry=await db.promotion_entries.find_one({'promotion_id':pid,'user_id':user['user_id']},{'_id':0})
    tickets=await db.promotion_tickets.find({'promotion_id':pid,'user_id':user['user_id']},{'_id':0}).sort('created_at',1).to_list(10000)
    return {'promotion':cfg,'joined':bool(entry),'tickets':tickets,'ticket_count':len(tickets)}

@router.post('/join')
async def join_promotion(request:Request):
    user=await get_current_user(request); db=get_db(); cfg=await _config(db)
    if not cfg['is_live']: raise HTTPException(status_code=400,detail='Promotion is not currently open.')
    pid=cfg['promotion_id']; now=datetime.now(timezone.utc)
    await db.promotion_entries.update_one({'promotion_id':pid,'user_id':user['user_id']},{'$setOnInsert':{'promotion_id':pid,'user_id':user['user_id'],'joined_at':now}},upsert=True)
    await _issue_ticket(db,pid,user['user_id'],'join'); await _sync_referral_ticket(db,pid,user['user_id'])
    tickets=await db.promotion_tickets.find({'promotion_id':pid,'user_id':user['user_id']},{'_id':0}).sort('created_at',1).to_list(10000)
    return {'joined':True,'tickets':tickets,'ticket_count':len(tickets)}

class ConfigInput(BaseModel):
    active:bool=False; promotion_id:str='freeworld-2026-01'; name:str='Free World Promotion'; mobile_image_url:str=''; tablet_image_url:str=''; desktop_image_url:str=''; prize_total_gbp:float=1000; winner_count:int=2; prize_per_winner_gbp:float=500; start_at:str|None=None; end_at:str|None=None

@admin_router.get('/config')
async def admin_get_config(request:Request): await require_admin(request); return await _config(get_db())
@admin_router.put('/config')
async def admin_save_config(inp:ConfigInput,request:Request):
    await require_admin(request); db=get_db(); data=inp.model_dump(); data.update({'key':'freeworld','updated_at':datetime.now(timezone.utc)})
    await db.promotion_config.update_one({'key':'freeworld'},{'$set':data},upsert=True); return await _config(db)
@admin_router.get('/analytics')
async def admin_analytics(request:Request):
    await require_admin(request); db=get_db(); cfg=await _config(db); pid=cfg['promotion_id']
    return {'promotion':cfg,'participants':await db.promotion_entries.count_documents({'promotion_id':pid}),'total_tickets':await db.promotion_tickets.count_documents({'promotion_id':pid}),'referral_tickets':await db.promotion_tickets.count_documents({'promotion_id':pid,'source':'referral'})}
