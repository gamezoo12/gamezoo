from fastapi import APIRouter, Request
from auth import require_admin
from deps import get_db
router=APIRouter(prefix='/api/admin/promotion',tags=['admin-promotion-source-analytics'])
@router.get('/source-analytics')
async def source_analytics(request:Request):
 await require_admin(request);db=get_db();cfg=await db.promotion_config.find_one({'key':'freeworld'},{'_id':0}) or {};pid=cfg.get('promotion_id','freeworld-2026-01');match={'promotion_id':pid}
 rows=await db.promotion_events.aggregate([{'$match':match},{'$group':{'_id':{'source':{'$ifNull':['$source','direct']},'medium':{'$ifNull':['$medium','']},'campaign':{'$ifNull':['$campaign','']}},'visitors':{'$addToSet':'$visitor_id'},'impressions':{'$sum':{'$cond':[{'$eq':['$event','impression']},1,0]}},'join_clicks':{'$sum':{'$cond':[{'$eq':['$event','join_click']},1,0]}},'refer_clicks':{'$sum':{'$cond':[{'$eq':['$event','refer_click']},1,0]}},'signup_starts':{'$sum':{'$cond':[{'$eq':['$event','signup_start']},1,0]}},'signup_completes':{'$sum':{'$cond':[{'$eq':['$event','signup_complete']},1,0]}},'profile_views':{'$sum':{'$cond':[{'$eq':['$event','profile_view']},1,0]}}}},{'$sort':{'impressions':-1}}]).to_list(1000)
 out=[]
 for x in rows:
  v=len([z for z in x.get('visitors',[]) if z]);j=x.get('join_clicks',0);s=x.get('signup_completes',0);out.append({'source':x['_id'].get('source') or 'direct','medium':x['_id'].get('medium') or '—','campaign':x['_id'].get('campaign') or '—','visitors':v,'impressions':x.get('impressions',0),'join_clicks':j,'refer_clicks':x.get('refer_clicks',0),'signup_starts':x.get('signup_starts',0),'signup_completes':s,'profile_views':x.get('profile_views',0),'visitor_to_join_pct':round(j*100/v,2) if v else 0,'join_to_signup_pct':round(s*100/j,2) if j else 0})
 referrers=await db.promotion_events.aggregate([{'$match':match},{'$group':{'_id':{'$ifNull':['$referrer','direct']},'count':{'$sum':1},'visitors':{'$addToSet':'$visitor_id'}}},{'$sort':{'count':-1}},{'$limit':100}]).to_list(100)
 landing=await db.promotion_events.aggregate([{'$match':match},{'$group':{'_id':'$page','count':{'$sum':1},'visitors':{'$addToSet':'$visitor_id'}}},{'$sort':{'count':-1}},{'$limit':100}]).to_list(100)
 return {'promotion_id':pid,'sources':out,'referrers':[{'referrer':x['_id'] or 'direct','events':x['count'],'visitors':len([v for v in x['visitors'] if v])} for x in referrers],'landing_pages':[{'page':x['_id'] or '/','events':x['count'],'visitors':len([v for v in x['visitors'] if v])} for x in landing]}
