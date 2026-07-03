from fastapi import APIRouter, HTTPException, Query
from typing import Optional

router = APIRouter(prefix='/api/contests', tags=['contests'])


def _to_public(c: dict) -> dict:
    sq = c.get('skill_question') or {}
    return {
        'contest_id': c['contest_id'],
        'slug': c['slug'],
        'title': c['title'],
        'subtitle': c.get('subtitle', ''),
        'category': c['category'],
        'tag': c['tag'],
        'price': c['price'],
        'tickets_sold': c.get('tickets_sold', 0),
        'tickets_total': c['tickets_total'],
        'prize_amount': c['prize_amount'],
        'end_date': c['end_date'],
        'image': c['image'],
        'jackpot': c.get('jackpot', False),
        'featured': c.get('featured', False),
        'status': c.get('status', 'live'),
        'skill_question_q': sq.get('q'),
        'skill_question_options': sq.get('options', []),
    }


@router.get('')
async def list_contests(category: Optional[str] = None, q: Optional[str] = Query(None)):
    from deps import get_db
    db = get_db()
    query = {'status': 'live'}
    if category and category != 'all':
        query['category'] = category
    if q:
        query['title'] = {'$regex': q, '$options': 'i'}
    docs = await db.contests.find(query, {'_id': 0}).to_list(500)
    return [_to_public(d) for d in docs]


@router.get('/{slug}')
async def get_contest(slug: str):
    from deps import get_db
    db = get_db()
    doc = await db.contests.find_one({'slug': slug}, {'_id': 0})
    if not doc:
        raise HTTPException(status_code=404, detail='Contest not found')
    return _to_public(doc)


@router.post('/{slug}/verify-skill')
async def verify_skill(slug: str, payload: dict):
    from deps import get_db
    db = get_db()
    doc = await db.contests.find_one({'slug': slug}, {'_id': 0})
    if not doc:
        raise HTTPException(status_code=404, detail='Contest not found')
    sq = doc.get('skill_question') or {}
    correct = (payload.get('answer', '') or '').strip() == sq.get('answer')
    return {'correct': correct}
