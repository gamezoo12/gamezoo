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
        'game_type': c.get('game_type'),
        'entry_mode': c.get('entry_mode', 'skill_game' if c.get('game_type') else 'random_tickets'),
        'max_attempts': int(c.get('max_attempts', c.get('attempts_per_ticket', 3))),
        'attempts_per_ticket': int(c.get('attempts_per_ticket', c.get('max_attempts', 3))),
        'leaderboard_visibility': c.get('leaderboard_visibility', 'live'),
        'winner_selection_method': c.get('winner_selection_method', 'random_draw'),
        'winner_published': bool(c.get('winner_published', False)),
        'winning_ticket_number': c.get('winning_ticket_number'),
        'winner_user_id': c.get('winner_user_id'),

        # ---- Extended editable fields (Phase-1 launch spec) ----
        'short_description': c.get('short_description'),
        'full_description': c.get('full_description'),
        'how_to_enter': c.get('how_to_enter'),
        'skill_instructions': c.get('skill_instructions'),
        'eligibility': c.get('eligibility'),
        'max_tickets_per_user': c.get('max_tickets_per_user'),
        'open_date': c.get('open_date'),
        'draw_date': c.get('draw_date'),
        'prize_details': c.get('prize_details'),
        'num_prizes': c.get('num_prizes', 1),
        'prize_values': c.get('prize_values'),
        'winner_method': c.get('winner_method'),
        'scoring_method': c.get('scoring_method'),
        'tiebreak_method': c.get('tiebreak_method'),
        'verification_method': c.get('verification_method'),
        'prize_credit_timeframe': c.get('prize_credit_timeframe'),
        'refund_conditions': c.get('refund_conditions'),
        'important_info': c.get('important_info'),
        'contest_rules': c.get('contest_rules'),
        'terms_acknowledgement': c.get('terms_acknowledgement'),
        'country_restrictions': c.get('country_restrictions'),
        'age_restriction': c.get('age_restriction', '18+'),
        'mobile_image': c.get('mobile_image'),
        'seo_title': c.get('seo_title'),
        'seo_description': c.get('seo_description'),
        'publication_status': c.get('publication_status', 'published'),
        'engine_type': c.get('engine_type', 'leaderboard'),
        'free_postal_entry_available': bool(c.get('free_postal_entry_available', False)),
        'free_postal_entry_instructions': c.get('free_postal_entry_instructions'),
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
