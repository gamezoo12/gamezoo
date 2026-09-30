from fastapi import APIRouter, Request
from auth import require_admin
from deps import get_db

router = APIRouter(tags=['admin-promotion-source-analytics'])

def _pct(a,b): return round(a*100/b,2) if b else 0

def _breakdown(bucket,key):
 return [{key:k,'visitors':v,'events':v} for k,v in sorted(bucket.items(),key=lambda x:x[1],reverse=True)[:100]]

@router.get('/source-analytics')
async def source_analytics(request:Request):
 await require_admin(request);db=get_db();cfg=await db.promotion_config.find_one({'key':'freeworld'},{'_id':0}) or {};pid=cfg.get('promotion_id','freeworld-2026-01');match={'promotion_id':pid}
 events=await db.promotion_events.find(match,{'_id':0}).sort('created_at',1).to_list(100000);visitor_ids=list({e.get('visitor_id') for e in events if e.get('visitor_id')})
 visits=await db.acquisition_visits.find({'visitor_id':{'$in':visitor_ids}},{'_id':0}).sort('created_at',1).to_list(100000) if visitor_ids else []
 byv={}
 for v in visits:byv.setdefault(v.get('visitor_id'),[]).append(v)
 names=['impression','close','join_click','refer_click','signup_start','signup_complete','profile_view'];journeys={}
 for e in events:
  vid=e.get('visitor_id') or f"user:{e.get('user_id') or 'unknown'}";j=journeys.setdefault(vid,{'visitor_id':e.get('visitor_id'),'user_id':e.get('user_id'),'events':{n:0 for n in names}})
  if e.get('user_id'):j['user_id']=e.get('user_id')
  if e.get('event') in j['events']:j['events'][e['event']]+=1
 rows={};buckets={k:{} for k in ['device','browser','os','channel','landing','referrer','term','content','last_source']}
 for vid,j in journeys.items():
  acq=byv.get(j.get('visitor_id'),[]);first=acq[0] if acq else {};last=acq[-1] if acq else {};ev=next((x for x in events if x.get('visitor_id')==j.get('visitor_id')),{})
  source=first.get('source') or ev.get('source') or 'direct';medium=first.get('utm_medium') or ev.get('medium') or '—';campaign=first.get('utm_campaign') or ev.get('campaign') or '—';key=(source,medium,campaign)
  r=rows.setdefault(key,{'source':source,'medium':medium,'campaign':campaign,'visitors':0,**{n:0 for n in names},'participants':0,'tickets':0,'referral_tickets':0});r['visitors']+=1
  for n in names:r[n]+=j['events'][n]
  vals={'device':first.get('device_type') or next(iter([e.get('device') for e in events if e.get('visitor_id')==j.get('visitor_id') and e.get('device')]),'unknown'),'browser':first.get('browser') or 'unknown','os':first.get('os') or 'unknown','channel':first.get('channel') or 'unknown','landing':first.get('landing_path') or ev.get('page') or '/','referrer':first.get('referrer_host') or ev.get('referrer') or 'direct','term':first.get('utm_term') or '—','content':first.get('utm_content') or '—','last_source':last.get('source') or source}
  for k,v in vals.items():buckets[k][v]=buckets[k].get(v,0)+1
 entries=await db.promotion_entries.find(match,{'_id':0}).to_list(100000);entry_users={x.get('user_id') for x in entries};tickets=await db.promotion_tickets.find(match,{'_id':0}).to_list(100000);tbu={}
 for t in tickets:tbu.setdefault(t.get('user_id'),[]).append(t)
 for j in journeys.values():
  uid=j.get('user_id');acq=byv.get(j.get('visitor_id'),[]);first=acq[0] if acq else {};ev=next((x for x in events if x.get('visitor_id')==j.get('visitor_id')),{});key=(first.get('source') or ev.get('source') or 'direct',first.get('utm_medium') or ev.get('medium') or '—',first.get('utm_campaign') or ev.get('campaign') or '—')
  if uid and key in rows:
   if uid in entry_users:rows[key]['participants']+=1
   uts=tbu.get(uid,[]);rows[key]['tickets']+=len(uts);rows[key]['referral_tickets']+=sum(1 for t in uts if t.get('source')=='referral')
 out=[]
 for r in rows.values():
  r.update({'impressions':r['impression'],'join_clicks':r['join_click'],'refer_clicks':r['refer_click'],'signup_starts':r['signup_start'],'signup_completes':r['signup_complete'],'profile_views':r['profile_view'],'visitor_to_join_pct':_pct(r['join_click'],r['visitors']),'join_to_signup_pct':_pct(r['signup_complete'],r['join_click']),'signup_to_participant_pct':_pct(r['participants'],r['signup_complete']),'impression_close_pct':_pct(r['close'],r['impression'])});out.append(r)
 out.sort(key=lambda x:x['visitors'],reverse=True);funnel={n:sum(j['events'][n] for j in journeys.values()) for n in names};funnel.update({'visitors':len(journeys),'participants':len(entry_users),'tickets':len(tickets),'referral_tickets':sum(1 for t in tickets if t.get('source')=='referral')})
 return {'promotion_id':pid,'sources':out,'funnel':funnel,'devices':_breakdown(buckets['device'],'device'),'browsers':_breakdown(buckets['browser'],'browser'),'operating_systems':_breakdown(buckets['os'],'os'),'channels':_breakdown(buckets['channel'],'channel'),'referrers':_breakdown(buckets['referrer'],'referrer'),'landing_pages':_breakdown(buckets['landing'],'page'),'terms':_breakdown(buckets['term'],'term'),'contents':_breakdown(buckets['content'],'content'),'last_touch_sources':_breakdown(buckets['last_source'],'source'),'journey_count':len(journeys)}
