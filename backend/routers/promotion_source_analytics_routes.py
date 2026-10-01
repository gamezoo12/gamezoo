from fastapi import APIRouter, Request
from auth import require_admin
from deps import get_db

# server.py includes this router directly, so the full admin prefix belongs here.
router = APIRouter(prefix='/api/admin/promotion', tags=['admin-promotion-source-analytics'])


def _pct(a, b):
    return round(a * 100 / b, 2) if b else 0


def _breakdown(bucket, key):
    return [
        {key: k, 'visitors': v, 'events': v}
        for k, v in sorted(bucket.items(), key=lambda x: x[1], reverse=True)[:100]
    ]


@router.get('/source-analytics')
async def source_analytics(request: Request):
    await require_admin(request)
    db = get_db()
    cfg = await db.promotion_config.find_one({'key': 'freeworld'}, {'_id': 0}) or {}
    pid = cfg.get('promotion_id', 'freeworld-2026-01')
    match = {'promotion_id': pid}

    events = await db.promotion_events.find(match, {'_id': 0}).sort('created_at', 1).to_list(100000)
    visitor_ids = list({e.get('visitor_id') for e in events if e.get('visitor_id')})
    visits = (
        await db.acquisition_visits.find(
            {'visitor_id': {'$in': visitor_ids}}, {'_id': 0}
        ).sort('created_at', 1).to_list(100000)
        if visitor_ids else []
    )

    byv = {}
    for visit in visits:
        byv.setdefault(visit.get('visitor_id'), []).append(visit)

    names = [
        'impression', 'close', 'join_click', 'refer_click',
        'signup_start', 'signup_complete', 'profile_view'
    ]
    journeys = {}
    event_by_visitor = {}

    for event in events:
        visitor_id = event.get('visitor_id')
        if visitor_id and visitor_id not in event_by_visitor:
            event_by_visitor[visitor_id] = event
        journey_key = visitor_id or f"user:{event.get('user_id') or 'unknown'}"
        journey = journeys.setdefault(
            journey_key,
            {
                'visitor_id': visitor_id,
                'user_id': event.get('user_id'),
                'events': {name: 0 for name in names},
            },
        )
        if event.get('user_id'):
            journey['user_id'] = event.get('user_id')
        if event.get('event') in journey['events']:
            journey['events'][event['event']] += 1

    rows = {}
    buckets = {
        key: {} for key in [
            'device', 'browser', 'os', 'channel', 'landing',
            'referrer', 'term', 'content', 'last_source'
        ]
    }

    journey_attribution = {}
    for journey_key, journey in journeys.items():
        visitor_id = journey.get('visitor_id')
        acquisition = byv.get(visitor_id, [])
        first = acquisition[0] if acquisition else {}
        last = acquisition[-1] if acquisition else {}
        event = event_by_visitor.get(visitor_id, {})

        source = first.get('source') or event.get('source') or 'direct'
        medium = first.get('utm_medium') or event.get('medium') or '—'
        campaign = first.get('utm_campaign') or event.get('campaign') or '—'
        row_key = (source, medium, campaign)
        journey_attribution[journey_key] = row_key

        row = rows.setdefault(
            row_key,
            {
                'source': source,
                'medium': medium,
                'campaign': campaign,
                'visitors': 0,
                **{name: 0 for name in names},
                'participants': 0,
                'tickets': 0,
                'referral_tickets': 0,
            },
        )
        row['visitors'] += 1
        for name in names:
            row[name] += journey['events'][name]

        event_device = next(
            (
                e.get('device') for e in events
                if e.get('visitor_id') == visitor_id and e.get('device')
            ),
            'unknown',
        )
        values = {
            'device': first.get('device_type') or event_device,
            'browser': first.get('browser') or 'unknown',
            'os': first.get('os') or 'unknown',
            'channel': first.get('channel') or medium or 'unknown',
            'landing': first.get('landing_path') or event.get('page') or '/',
            'referrer': first.get('referrer_host') or event.get('referrer') or 'direct',
            'term': first.get('utm_term') or '—',
            'content': first.get('utm_content') or '—',
            'last_source': last.get('source') or source,
        }
        for key, value in values.items():
            buckets[key][value] = buckets[key].get(value, 0) + 1

    entries = await db.promotion_entries.find(match, {'_id': 0}).to_list(100000)
    entry_users = {entry.get('user_id') for entry in entries}
    tickets = await db.promotion_tickets.find(match, {'_id': 0}).to_list(100000)
    tickets_by_user = {}
    for ticket in tickets:
        tickets_by_user.setdefault(ticket.get('user_id'), []).append(ticket)

    for journey_key, journey in journeys.items():
        uid = journey.get('user_id')
        row_key = journey_attribution.get(journey_key)
        if not uid or row_key not in rows:
            continue
        if uid in entry_users:
            rows[row_key]['participants'] += 1
        user_tickets = tickets_by_user.get(uid, [])
        rows[row_key]['tickets'] += len(user_tickets)
        rows[row_key]['referral_tickets'] += sum(
            1 for ticket in user_tickets if ticket.get('source') == 'referral'
        )

    output = []
    for row in rows.values():
        row.update({
            'impressions': row['impression'],
            'join_clicks': row['join_click'],
            'refer_clicks': row['refer_click'],
            'signup_starts': row['signup_start'],
            'signup_completes': row['signup_complete'],
            'profile_views': row['profile_view'],
            'visitor_to_join_pct': _pct(row['join_click'], row['visitors']),
            'join_to_signup_pct': _pct(row['signup_complete'], row['join_click']),
            'signup_to_participant_pct': _pct(row['participants'], row['signup_complete']),
            'impression_close_pct': _pct(row['close'], row['impression']),
        })
        output.append(row)

    output.sort(key=lambda x: x['visitors'], reverse=True)
    funnel = {
        name: sum(journey['events'][name] for journey in journeys.values())
        for name in names
    }
    funnel.update({
        'visitors': len(journeys),
        'participants': len(entry_users),
        'tickets': len(tickets),
        'referral_tickets': sum(
            1 for ticket in tickets if ticket.get('source') == 'referral'
        ),
    })

    return {
        'promotion_id': pid,
        'sources': output,
        'funnel': funnel,
        'devices': _breakdown(buckets['device'], 'device'),
        'browsers': _breakdown(buckets['browser'], 'browser'),
        'operating_systems': _breakdown(buckets['os'], 'os'),
        'channels': _breakdown(buckets['channel'], 'channel'),
        'referrers': _breakdown(buckets['referrer'], 'referrer'),
        'landing_pages': _breakdown(buckets['landing'], 'page'),
        'terms': _breakdown(buckets['term'], 'term'),
        'contents': _breakdown(buckets['content'], 'content'),
        'last_touch_sources': _breakdown(buckets['last_source'], 'source'),
        'journey_count': len(journeys),
    }
