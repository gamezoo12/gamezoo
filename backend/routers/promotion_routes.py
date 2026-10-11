from datetime import datetime, timezone
import secrets
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field
from typing import Literal
from auth import get_current_user, require_admin
from deps import get_db

router=APIRouter(prefix='/api/promotion',tags=['promotion']);admin_router=APIRouter(prefix='/api/admin/promotion',tags=['admin-promotion'])
DEFAULT_CONFIG={'promotion_id':'freeworld-2026-01','name':'Free World Promotion','active':False,'mobile_image_url':'','tablet_image_url':'','desktop_image_url':'','prize_total_gbp':1000,'winner_count':2,'prize_per_winner_gbp':500,'start_at':None,'end_at':None}
CAMPAIGN_TYPES={'ticket_draw','referral_draw','token_credit'}
def _public_config(doc):
 d={**DEFAULT_CONFIG,**(doc or {})};d.pop('_id',None);now=datetime.now(timezone.utc);active=bool(d.get('active'))
 for key,is_start in [('start_at',True),('end_at',False)]:
  value=d.get(key)
  if value:
   try:
    dt=datetime.fromisoformat(str(value).replace('Z','+00:00'));dt=dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    if (is_start and now<dt) or (not is_start and now>=dt):active=False
   except ValueError:active=False
 d['is_live']=active;return d
async def _config(db):return _public_config(await db.promotion_config.find_one({'key':'freeworld'},{'_id':0}))
def _public_campaign(doc):
 d=_public_config(doc);d.setdefault('campaign_type','referral_draw');d.setdefault('description','');d.setdefault('reward_tokens',0);d.setdefault('legacy',False);return d
async def _get_campaign(db,promotion_id):
 doc=await db.promotion_campaigns.find_one({'promotion_id':promotion_id},{'_id':0})
 if doc:return _public_campaign(doc)
 legacy=await _config(db)
 if legacy.get('promotion_id')==promotion_id:
  legacy.update({'campaign_type':'referral_draw','description':'Join the Free World promotion and earn tickets for eligible referrals.','legacy':True})
  return legacy
 return None
def _ticket_number():return 'FW-'+secrets.token_hex(5).upper()
async def _issue_ticket(db,pid,uid,source,referred_user_id=None):
 # Atomic upsert: retries/clicks/concurrent requests cannot create duplicate entitlement tickets.
 key={'promotion_id':pid,'user_id':uid,'source':source,'entitlement_key':('join' if source=='join' else f'referral:{referred_user_id}')}
 for _ in range(5):
  now=datetime.now(timezone.utc);candidate={**key,'ticket_number':_ticket_number(),'created_at':now}
  if referred_user_id:candidate['referred_user_id']=referred_user_id
  try:
   doc=await db.promotion_tickets.find_one_and_update(key,{'$setOnInsert':candidate},upsert=True,return_document=ReturnDocument.AFTER,projection={'_id':0})
   return doc
  except DuplicateKeyError:continue
 raise HTTPException(500,'Unable to allocate a unique promotion ticket.')
async def _sync_referral_ticket(db,pid,joined_user_id):
 # Promotion referral qualification is intentionally separate from the existing token reward programme.
 ref=await db.referrals.find_one({'referred_user_id':joined_user_id},{'_id':0,'referrer_user_id':1,'referral_id':1})
 if not ref:return None
 referrer=ref.get('referrer_user_id')
 if not referrer or referrer==joined_user_id:return None
 referrer_entry=await db.promotion_entries.find_one({'promotion_id':pid,'user_id':referrer},{'_id':0,'user_id':1})
 if not referrer_entry:return None
 return await _issue_ticket(db,pid,referrer,'referral',joined_user_id)
async def auto_join_referred_signup(db,referred_user_id):
 # Idempotent for both new and historical referrals. If a valid personal referral exists,
 # enrol the referred user into the live promotion and issue the normal join ticket.
 cfg=await _config(db)
 if not cfg.get('is_live'):return {'joined':False,'reason':'promotion_not_live'}
 pid=cfg['promotion_id'];now=datetime.now(timezone.utc)
 ref=await db.referrals.find_one({'referred_user_id':referred_user_id},{'_id':0,'referrer_user_id':1})
 if not ref:return {'joined':False,'reason':'not_referred'}
 await db.promotion_entries.update_one(
  {'promotion_id':pid,'user_id':referred_user_id},
  {'$setOnInsert':{'promotion_id':pid,'user_id':referred_user_id,'joined_at':now,'join_source':'referred_signup'}},
  upsert=True
 )
 await _issue_ticket(db,pid,referred_user_id,'join')
 await _sync_referral_ticket(db,pid,referred_user_id)
 return {'joined':True,'promotion_id':pid}
async def _backfill_my_referral_tickets(db,pid,uid):
 # Historical recovery: every valid existing A->B referral is brought onto the
 # current live promotion before A's referral ticket is checked. Safe to run
 # repeatedly because entries and tickets are idempotent upserts.
 refs=await db.referrals.find({'referrer_user_id':uid},{'_id':0,'referred_user_id':1}).to_list(10000)
 for ref in refs:
  referred=ref.get('referred_user_id')
  if not referred or referred==uid:continue
  await auto_join_referred_signup(db,referred)
  joined=await db.promotion_entries.find_one({'promotion_id':pid,'user_id':referred},{'_id':0,'user_id':1})
  if joined:await _issue_ticket(db,pid,uid,'referral',referred)
async def _backfill_all_referrals(db,pid):
 # Global historical repair, also triggered from admin promotion views.
 cfg=await _config(db)
 if not cfg.get('is_live') or cfg.get('promotion_id')!=pid:return
 refs=await db.referrals.find({},{'_id':0,'referrer_user_id':1,'referred_user_id':1}).to_list(10000)
 for ref in refs:
  referrer=ref.get('referrer_user_id');referred=ref.get('referred_user_id')
  if not referrer or not referred or referrer==referred:continue
  await auto_join_referred_signup(db,referred)
  referrer_entry=await db.promotion_entries.find_one({'promotion_id':pid,'user_id':referrer},{'_id':0,'user_id':1})
  if referrer_entry:await _issue_ticket(db,pid,referrer,'referral',referred)
class CampaignInput(BaseModel):
 promotion_id:str=Field(min_length=3,max_length=80,pattern=r'^[a-z0-9-]+$')
 name:str=Field(min_length=2,max_length=120)
 description:str=Field(default='',max_length=2000)
 campaign_type:Literal['ticket_draw','referral_draw','token_credit']='ticket_draw'
 active:bool=True
 start_at:str|None=None
 end_at:str|None=None
 reward_tokens:int=Field(default=0,ge=0,le=1000)
 prize_total_gbp:float=Field(default=0,ge=0,le=1000000)
 winner_count:int=Field(default=1,ge=1,le=1000)
 prize_per_winner_gbp:float=Field(default=0,ge=0,le=1000000)
 mobile_image_url:str=''
 tablet_image_url:str=''
 desktop_image_url:str=''


@router.get('/campaigns')
async def list_promotion_campaigns(request:Request):
 user=await get_current_user(request);db=get_db();legacy=await _config(db)
 docs=await db.promotion_campaigns.find({}, {'_id':0}).sort('created_at',-1).to_list(200)
 if not any(d.get('promotion_id')==legacy.get('promotion_id') for d in docs):
  legacy.update({'campaign_type':'referral_draw','description':'Join the Free World promotion and earn tickets for eligible referrals.','legacy':True})
  docs.append(legacy)
 campaigns=[]
 for doc in docs:
  campaign=_public_campaign(doc);pid=campaign['promotion_id'];entry=await db.promotion_entries.find_one({'promotion_id':pid,'user_id':user['user_id']},{'_id':0,'joined_at':1})
  claim=await db.promotion_claims.find_one({'promotion_id':pid,'user_id':user['user_id']},{'_id':0,'claimed_at':1,'reward_tokens':1})
  tickets=await db.promotion_tickets.find({'promotion_id':pid,'user_id':user['user_id']},{'_id':0,'ticket_number':1,'source':1,'created_at':1}).sort('created_at',1).to_list(500)
  campaign.update({'joined':bool(entry or claim),'joined_at':(entry or claim or {}).get('joined_at') or (claim or {}).get('claimed_at'),'tickets':tickets,'ticket_count':len(tickets),'claimed_tokens':(claim or {}).get('reward_tokens',0)})
  campaigns.append(campaign)
 return {'campaigns':campaigns}


@router.post('/campaigns/{promotion_id}/claim')
async def claim_promotion_campaign(promotion_id:str,request:Request):
 user=await get_current_user(request);db=get_db();campaign=await _get_campaign(db,promotion_id)
 if not campaign:raise HTTPException(404,'Promotion not found')
 if not campaign.get('is_live'):raise HTTPException(410,'This promotion has expired or is not open yet.')
 if campaign.get('legacy'):
  pid=campaign['promotion_id'];uid=user['user_id'];now=datetime.now(timezone.utc)
  await db.promotion_entries.update_one({'promotion_id':pid,'user_id':uid},{'$setOnInsert':{'promotion_id':pid,'user_id':uid,'joined_at':now}},upsert=True)
  await _issue_ticket(db,pid,uid,'join');await _sync_referral_ticket(db,pid,uid);await _backfill_my_referral_tickets(db,pid,uid)
  tickets=await db.promotion_tickets.find({'promotion_id':pid,'user_id':uid},{'_id':0}).sort('created_at',1).to_list(10000)
  return {'joined':True,'promotion_id':pid,'ticket_count':len(tickets),'tickets':tickets}
 uid=user['user_id'];now=datetime.now(timezone.utc)
 if campaign['campaign_type']=='token_credit':
  amount=int(campaign.get('reward_tokens') or 0)
  if amount<1:raise HTTPException(400,'This token promotion has no reward configured.')
  await db.promotion_claims.create_index([('promotion_id',1),('user_id',1)],unique=True,name='uniq_promotion_claim_user')
  existing=await db.promotion_claims.find_one({'promotion_id':promotion_id,'user_id':uid},{'_id':0})
  if existing:return {'joined':True,'already_claimed':True,'claimed_tokens':existing.get('reward_tokens',0)}
  from routers.wallet_routes import _apply_tx_idempotent
  tx=await _apply_tx_idempotent(db,uid,'promo_bonus',float(amount),note=f"Promotion reward: {campaign['name']}",ref_order_id=f'promotion_claim:{promotion_id}:{uid}')
  await db.promotion_claims.update_one({'promotion_id':promotion_id,'user_id':uid},{'$setOnInsert':{'promotion_id':promotion_id,'user_id':uid,'reward_tokens':amount,'claimed_at':now,'campaign_type':'token_credit'}},upsert=True)
  return {'joined':True,'promotion_id':promotion_id,'claimed_tokens':amount,'balance':tx.get('balance')}

 await db.promotion_entries.update_one({'promotion_id':promotion_id,'user_id':uid},{'$setOnInsert':{'promotion_id':promotion_id,'user_id':uid,'joined_at':now,'campaign_type':campaign['campaign_type']}},upsert=True)
 await _issue_ticket(db,promotion_id,uid,'join')
 if campaign['campaign_type']=='referral_draw':
  await _sync_referral_ticket(db,promotion_id,uid)
  refs=await db.referrals.find({'referrer_user_id':uid},{'_id':0,'referred_user_id':1}).to_list(1000)
  for ref in refs:
   friend=ref.get('referred_user_id')
   if friend and friend!=uid and await db.promotion_entries.find_one({'promotion_id':promotion_id,'user_id':friend},{'_id':1}):
    await _issue_ticket(db,promotion_id,uid,'referral',friend)
 tickets=await db.promotion_tickets.find({'promotion_id':promotion_id,'user_id':uid},{'_id':0}).sort('created_at',1).to_list(10000)
 return {'joined':True,'promotion_id':promotion_id,'ticket_count':len(tickets),'tickets':tickets}


class EventInput(BaseModel):
 event: str
 visitor_id: str | None = None
 page: str | None = None
 device: str | None = None
 source: str | None = None
 medium: str | None = None
 campaign: str | None = None
 referrer: str | None = None
 promotion_id: str | None = None


@router.post('/event')
async def promotion_event(inp:EventInput,request:Request):
 db=get_db();cfg=await _config(db);allowed={'impression','close','join_click','refer_click','signup_start','signup_complete','profile_view'}
 if inp.event not in allowed:raise HTTPException(400,'Unknown promotion event')
 if inp.promotion_id:
  campaign=await _get_campaign(db,inp.promotion_id)
  if not campaign:raise HTTPException(404,'Promotion not found')
  cfg=campaign
 uid=None
 try:uid=(await get_current_user(request)).get('user_id')
 except Exception:pass
 await db.promotion_events.insert_one({'promotion_id':cfg['promotion_id'],'event':inp.event,'visitor_id':inp.visitor_id,'user_id':uid,'page':inp.page,'device':inp.device,'source':inp.source,'medium':inp.medium,'campaign':inp.campaign,'referrer':inp.referrer,'created_at':datetime.now(timezone.utc)});return {'ok':True}
@router.get('/config')
async def promotion_config():
 db=get_db();legacy=await _config(db)
 if legacy.get('is_live'):return legacy
 docs=await db.promotion_campaigns.find({'active':True},{'_id':0}).sort('start_at',1).to_list(200)
 for doc in docs:
  campaign=_public_campaign(doc)
  if campaign.get('is_live'):return campaign
 return legacy
@router.get('/me')
async def promotion_me(request:Request):
 user=await get_current_user(request);db=get_db();cfg=await _config(db);pid=cfg['promotion_id'];uid=user['user_id']
 # Repair historical referred signups lazily when either referred user opens the promotion page.
 if cfg.get('is_live'):
  await auto_join_referred_signup(db,uid)
  await _backfill_my_referral_tickets(db,pid,uid)
 entry=await db.promotion_entries.find_one({'promotion_id':pid,'user_id':uid},{'_id':0})
 tickets=await db.promotion_tickets.find({'promotion_id':pid,'user_id':uid},{'_id':0}).sort('created_at',1).to_list(10000)
 return {'promotion':cfg,'joined':bool(entry),'tickets':tickets,'ticket_count':len(tickets),'base_ticket_count':sum(1 for t in tickets if t.get('source')=='join'),'referral_ticket_count':sum(1 for t in tickets if t.get('source')=='referral')}
@router.post('/join')
async def join_promotion(request:Request):
 user=await get_current_user(request);db=get_db();cfg=await _config(db)
 if not cfg['is_live']:raise HTTPException(400,'Promotion is not currently open.')
 pid=cfg['promotion_id'];uid=user['user_id'];now=datetime.now(timezone.utc)
 await db.promotion_entries.update_one({'promotion_id':pid,'user_id':uid},{'$setOnInsert':{'promotion_id':pid,'user_id':uid,'joined_at':now}},upsert=True)
 await _issue_ticket(db,pid,uid,'join');await _sync_referral_ticket(db,pid,uid);await _backfill_my_referral_tickets(db,pid,uid)
 tickets=await db.promotion_tickets.find({'promotion_id':pid,'user_id':uid},{'_id':0}).sort('created_at',1).to_list(10000)
 return {'joined':True,'tickets':tickets,'ticket_count':len(tickets),'base_ticket_count':sum(1 for t in tickets if t.get('source')=='join'),'referral_ticket_count':sum(1 for t in tickets if t.get('source')=='referral')}
class ConfigInput(BaseModel):
 active:bool=False;promotion_id:str='freeworld-2026-01';name:str='Free World Promotion';mobile_image_url:str='';tablet_image_url:str='';desktop_image_url:str='';prize_total_gbp:float=1000;winner_count:int=2;prize_per_winner_gbp:float=500;start_at:str|None=None;end_at:str|None=None
@admin_router.get('/config')
async def admin_get_config(request:Request):await require_admin(request);return await _config(get_db())
@admin_router.put('/config')
async def admin_save_config(inp:ConfigInput,request:Request):
 await require_admin(request);db=get_db();data=inp.model_dump();data.update({'key':'freeworld','updated_at':datetime.now(timezone.utc)});await db.promotion_config.update_one({'key':'freeworld'},{'$set':data},upsert=True);return await _config(db)


async def _save_campaign(inp:CampaignInput,request:Request,create:bool):
 admin=await require_admin(request);db=get_db();now=datetime.now(timezone.utc)
 if inp.campaign_type=='token_credit' and inp.reward_tokens<1:raise HTTPException(400,'Token-credit campaigns need a reward of at least 1 token.')
 if inp.start_at and inp.end_at:
  try:
   start=datetime.fromisoformat(inp.start_at.replace('Z','+00:00'));end=datetime.fromisoformat(inp.end_at.replace('Z','+00:00'))
  except ValueError:raise HTTPException(400,'Start and expiry must be valid ISO dates.')
  if end<=start:raise HTTPException(400,'Expiry must be after the start time.')
 existing=await db.promotion_campaigns.find_one({'promotion_id':inp.promotion_id},{'_id':0})
 if create and existing:raise HTTPException(409,'Promotion ID already exists.')
 if not create and not existing:raise HTTPException(404,'Promotion campaign not found.')
 data=inp.model_dump();data.update({'updated_at':now,'updated_by':admin.get('user_id')})
 if create:data['created_at']=now
 await db.promotion_campaigns.update_one({'promotion_id':inp.promotion_id},{'$set':data},upsert=create)
 return _public_campaign(await db.promotion_campaigns.find_one({'promotion_id':inp.promotion_id},{'_id':0}))


@admin_router.get('/campaigns')
async def admin_list_campaigns(request:Request):
 await require_admin(request);db=get_db();legacy=await _config(db)
 docs=await db.promotion_campaigns.find({}, {'_id':0}).sort('created_at',-1).to_list(500)
 if not any(doc.get('promotion_id')==legacy.get('promotion_id') for doc in docs):
  legacy.update({'campaign_type':'referral_draw','description':'Legacy Free World referral promotion.','legacy':True});docs.append(legacy)
 return {'campaigns':[_public_campaign(doc) for doc in docs]}


@admin_router.post('/campaigns')
async def admin_create_campaign(inp:CampaignInput,request:Request):
 return {'campaign':await _save_campaign(inp,request,True)}


@admin_router.put('/campaigns/{promotion_id}')
async def admin_update_campaign(promotion_id:str,inp:CampaignInput,request:Request):
 if promotion_id!=inp.promotion_id:raise HTTPException(400,'Promotion ID does not match route.')
 return {'campaign':await _save_campaign(inp,request,False)}
@admin_router.get('/analytics')
async def admin_analytics(request:Request):
 await require_admin(request);db=get_db();cfg=await _config(db);pid=cfg['promotion_id'];await _backfill_all_referrals(db,pid);match={'promotion_id':pid};events=await db.promotion_events.aggregate([{'$match':match},{'$group':{'_id':'$event','count':{'$sum':1},'unique_visitors':{'$addToSet':'$visitor_id'},'unique_users':{'$addToSet':'$user_id'}}}]).to_list(100);event_map={x['_id']:{'count':x['count'],'unique_visitors':len([v for v in x['unique_visitors'] if v]),'unique_users':len([v for v in x['unique_users'] if v])} for x in events};participants=await db.promotion_entries.count_documents(match);total=await db.promotion_tickets.count_documents(match);base=await db.promotion_tickets.count_documents({**match,'source':'join'});refs=await db.promotion_tickets.count_documents({**match,'source':'referral'});impressions=event_map.get('impression',{}).get('count',0);joins=event_map.get('join_click',{}).get('count',0);devices=await db.promotion_events.aggregate([{'$match':{**match,'event':'impression'}},{'$group':{'_id':'$device','count':{'$sum':1}}},{'$sort':{'count':-1}}]).to_list(20);pages=await db.promotion_events.aggregate([{'$match':{**match,'event':'impression'}},{'$group':{'_id':'$page','count':{'$sum':1}}},{'$sort':{'count':-1}},{'$limit':50}]).to_list(50);sources=await db.promotion_events.aggregate([{'$match':{**match,'event':'impression'}},{'$group':{'_id':'$source','count':{'$sum':1}}},{'$sort':{'count':-1}},{'$limit':50}]).to_list(50);daily=await db.promotion_events.aggregate([{'$match':match},{'$group':{'_id':{'day':{'$dateToString':{'format':'%Y-%m-%d','date':'$created_at'}},'event':'$event'},'count':{'$sum':1}}},{'$sort':{'_id.day':1}}]).to_list(10000);return {'promotion':cfg,'participants':participants,'total_tickets':total,'base_tickets':base,'referral_tickets':refs,'events':event_map,'conversion':{'impression_to_join_click_pct':round(joins*100/impressions,2) if impressions else 0,'participant_per_impression_pct':round(participants*100/impressions,2) if impressions else 0},'devices':devices,'pages':pages,'sources':sources,'daily':daily}
@admin_router.get('/participants')
async def admin_participants(request:Request,q:str|None=None,limit:int=Query(200,ge=1,le=1000),skip:int=Query(0,ge=0)):
 await require_admin(request);db=get_db();cfg=await _config(db);pid=cfg['promotion_id'];await _backfill_all_referrals(db,pid);entries=await db.promotion_entries.find({'promotion_id':pid},{'_id':0}).sort('joined_at',-1).skip(skip).limit(limit).to_list(limit);out=[]
 for e in entries:
  uid=e['user_id'];user=await db.users.find_one({'user_id':uid},{'_id':0,'user_id':1,'email':1,'name':1,'username':1,'public_id':1});tickets=await db.promotion_tickets.find({'promotion_id':pid,'user_id':uid},{'_id':0}).sort('created_at',1).to_list(10000);row={'user':user or {'user_id':uid},'joined_at':e.get('joined_at'),'ticket_count':len(tickets),'base_tickets':sum(1 for t in tickets if t.get('source')=='join'),'referral_tickets':sum(1 for t in tickets if t.get('source')=='referral'),'tickets':tickets};hay=' '.join(str((user or {}).get(k,'')) for k in ['email','name','username','public_id','user_id']).lower()
  if not q or q.lower() in hay or any(q.lower() in str(t.get('ticket_number','')).lower() for t in tickets):out.append(row)
 return {'items':out,'count':len(out),'skip':skip,'limit':limit}
@admin_router.get('/events')
async def admin_events(request:Request,event:str|None=None,device:str|None=None,page:str|None=None,limit:int=Query(500,ge=1,le=2000),skip:int=Query(0,ge=0)):
 await require_admin(request);db=get_db();cfg=await _config(db);pid=cfg['promotion_id'];f={'promotion_id':pid}
 if event:f['event']=event
 if device:f['device']=device
 if page:f['page']=page
 items=await db.promotion_events.find(f,{'_id':0}).sort('created_at',-1).skip(skip).limit(limit).to_list(limit);return {'items':items,'count':len(items),'skip':skip,'limit':limit}
