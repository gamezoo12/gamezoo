from datetime import datetime, timezone
import secrets
from fastapi import APIRouter, HTTPException, Request, Query
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
    if existing:return existing
    doc={**dedupe,'ticket_number':_ticket_number(),'created_at':datetime.now(timezone.utc)}
    await db.promotion_tickets.insert_one(doc);doc.pop('_id',None);return doc
async def _sync_referral_ticket(db,promotion_id,joined_user_id):
    ref=await db.referrals.find_one({'referred_user_id':joined_user_id},{'_id':0,'referrer_user_id':1})
    if not ref or ref.get('referrer_user_id')==joined_user_id:return
    joined=await db.promotion_entries.find_one({'promotion_id':promotion_id,'user_id':ref['referrer_user_id']})
    if joined:await _issue_ticket(db,promotion_id,ref['referrer_user_id'],'referral',joined_user_id)

class EventInput(BaseModel):
    event:str; visitor_id:str|None=None; page:str|None=None; device:str|None=None; source:str|None=None; medium:str|None=None; campaign:str|None=None; referrer:str|None=None
@router.post('/event')
async def promotion_event(inp:EventInput,request:Request):
    db=get_db();cfg=await _config(db);allowed={'impression','close','join_click','refer_click','signup_start','signup_complete','profile_view'}
    if inp.event not in allowed:raise HTTPException(400,'Unknown promotion event')
    user_id=None
    try:user_id=(await get_current_user(request)).get('user_id')
    except Exception:pass
    await db.promotion_events.insert_one({'promotion_id':cfg['promotion_id'],'event':inp.event,'visitor_id':inp.visitor_id,'user_id':user_id,'page':inp.page,'device':inp.device,'source':inp.source,'medium':inp.medium,'campaign':inp.campaign,'referrer':inp.referrer,'created_at':datetime.now(timezone.utc)})
    return {'ok':True}
@router.get('/config')
async def promotion_config():return await _config(get_db())
@router.get('/me')
async def promotion_me(request:Request):
    user=await get_current_user(request);db=get_db();cfg=await _config(db);pid=cfg['promotion_id'];entry=await db.promotion_entries.find_one({'promotion_id':pid,'user_id':user['user_id']},{'_id':0});tickets=await db.promotion_tickets.find({'promotion_id':pid,'user_id':user['user_id']},{'_id':0}).sort('created_at',1).to_list(10000)
    return {'promotion':cfg,'joined':bool(entry),'tickets':tickets,'ticket_count':len(tickets)}
@router.post('/join')
async def join_promotion(request:Request):
    user=await get_current_user(request);db=get_db();cfg=await _config(db)
    if not cfg['is_live']:raise HTTPException(400,'Promotion is not currently open.')
    pid=cfg['promotion_id'];now=datetime.now(timezone.utc);await db.promotion_entries.update_one({'promotion_id':pid,'user_id':user['user_id']},{'$setOnInsert':{'promotion_id':pid,'user_id':user['user_id'],'joined_at':now}},upsert=True);await _issue_ticket(db,pid,user['user_id'],'join');await _sync_referral_ticket(db,pid,user['user_id']);tickets=await db.promotion_tickets.find({'promotion_id':pid,'user_id':user['user_id']},{'_id':0}).sort('created_at',1).to_list(10000);return {'joined':True,'tickets':tickets,'ticket_count':len(tickets)}

class ConfigInput(BaseModel):
    active:bool=False;promotion_id:str='freeworld-2026-01';name:str='Free World Promotion';mobile_image_url:str='';tablet_image_url:str='';desktop_image_url:str='';prize_total_gbp:float=1000;winner_count:int=2;prize_per_winner_gbp:float=500;start_at:str|None=None;end_at:str|None=None
@admin_router.get('/config')
async def admin_get_config(request:Request):await require_admin(request);return await _config(get_db())
@admin_router.put('/config')
async def admin_save_config(inp:ConfigInput,request:Request):
    await require_admin(request);db=get_db();data=inp.model_dump();data.update({'key':'freeworld','updated_at':datetime.now(timezone.utc)});await db.promotion_config.update_one({'key':'freeworld'},{'$set':data},upsert=True);return await _config(db)

@admin_router.get('/analytics')
async def admin_analytics(request:Request):
    await require_admin(request);db=get_db();cfg=await _config(db);pid=cfg['promotion_id'];match={'promotion_id':pid}
    events=await db.promotion_events.aggregate([{'$match':match},{'$group':{'_id':'$event','count':{'$sum':1},'unique_visitors':{'$addToSet':'$visitor_id'},'unique_users':{'$addToSet':'$user_id'}}}]).to_list(100)
    event_map={x['_id']:{'count':x['count'],'unique_visitors':len([v for v in x['unique_visitors'] if v]),'unique_users':len([v for v in x['unique_users'] if v])} for x in events}
    participants=await db.promotion_entries.count_documents(match);total_tickets=await db.promotion_tickets.count_documents(match);base=await db.promotion_tickets.count_documents({**match,'source':'join'});refs=await db.promotion_tickets.count_documents({**match,'source':'referral'})
    impressions=event_map.get('impression',{}).get('count',0);joins=event_map.get('join_click',{}).get('count',0)
    devices=await db.promotion_events.aggregate([{'$match':{**match,'event':'impression'}},{'$group':{'_id':'$device','count':{'$sum':1}}},{'$sort':{'count':-1}}]).to_list(20)
    pages=await db.promotion_events.aggregate([{'$match':{**match,'event':'impression'}},{'$group':{'_id':'$page','count':{'$sum':1}}},{'$sort':{'count':-1}},{'$limit':50}]).to_list(50)
    sources=await db.promotion_events.aggregate([{'$match':{**match,'event':'impression'}},{'$group':{'_id':'$source','count':{'$sum':1}}},{'$sort':{'count':-1}},{'$limit':50}]).to_list(50)
    daily=await db.promotion_events.aggregate([{'$match':match},{'$group':{'_id':{'day':{'$dateToString':{'format':'%Y-%m-%d','date':'$created_at'}},'event':'$event'},'count':{'$sum':1}}},{'$sort':{'_id.day':1}}]).to_list(10000)
    return {'promotion':cfg,'participants':participants,'total_tickets':total_tickets,'base_tickets':base,'referral_tickets':refs,'events':event_map,'conversion':{'impression_to_join_click_pct':round(joins*100/impressions,2) if impressions else 0,'participant_per_impression_pct':round(participants*100/impressions,2) if impressions else 0},'devices':devices,'pages':pages,'sources':sources,'daily':daily}

@admin_router.get('/participants')
async def admin_participants(request:Request,q:str|None=None,limit:int=Query(200,ge=1,le=1000),skip:int=Query(0,ge=0)):
    await require_admin(request);db=get_db();cfg=await _config(db);pid=cfg['promotion_id'];entries=await db.promotion_entries.find({'promotion_id':pid},{'_id':0}).sort('joined_at',-1).skip(skip).limit(limit).to_list(limit);out=[]
    for e in entries:
        uid=e['user_id'];user=await db.users.find_one({'user_id':uid},{'_id':0,'user_id':1,'email':1,'name':1,'username':1,'public_id':1});tickets=await db.promotion_tickets.find({'promotion_id':pid,'user_id':uid},{'_id':0}).sort('created_at',1).to_list(10000)
        row={'user':user or {'user_id':uid},'joined_at':e.get('joined_at'),'ticket_count':len(tickets),'base_tickets':sum(1 for t in tickets if t.get('source')=='join'),'referral_tickets':sum(1 for t in tickets if t.get('source')=='referral'),'tickets':tickets}
        hay=' '.join(str((user or {}).get(k,'')) for k in ['email','name','username','public_id','user_id']).lower()
        if not q or q.lower() in hay or any(q.lower() in str(t.get('ticket_number','')).lower() for t in tickets):out.append(row)
    return {'items':out,'count':len(out),'skip':skip,'limit':limit}

@admin_router.get('/events')
async def admin_events(request:Request,event:str|None=None,device:str|None=None,page:str|None=None,limit:int=Query(500,ge=1,le=2000),skip:int=Query(0,ge=0)):
    await require_admin(request);db=get_db();cfg=await _config(db);f={'promotion_id':cfg['promotion_id']}
    if event:f['event']=event
    if device:f['device']=device
    if page:f['page']=page
    items=await db.promotion_events.find(f,{'_id':0}).sort('created_at',-1).skip(skip).limit(limit).to_list(limit);return {'items':items,'count':len(items),'skip':skip,'limit':limit}
