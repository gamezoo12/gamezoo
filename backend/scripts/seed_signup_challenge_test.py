"""Preview-only seed for Signup Challenge QA: a published Welcome Challenge + fresh UK and international test users.

Usage: python scripts/seed_signup_challenge_test.py [--enable] [--disable]
Re-running resets the two test users' participation so the challenge appears again.
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from auth import hash_password  # noqa: E402

CID = 'SC-QA-WELCOME'
USERS = [('sc.uk@example.com', 'sc_qa_uk', 'GB', '+447700900555'), ('sc.intl@example.com', 'sc_qa_intl', 'US', '+12025550188')]
RULES = ('Prize League Welcome Challenge - £50 giveaway. Open to new UK residents aged 18+ with a verified UK (+44) mobile. '
         'Winner: the single fastest verified completion time (1 to 20) at the closing date; ties broken by the earliest finish. '
         'Free to enter, no purchase necessary. Prize paid only after winner verification.')


async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    now = datetime.now(timezone.utc)
    await db.signup_challenges.update_many({'status': 'published', 'challenge_id': {'$ne': CID}}, {'$set': {'status': 'paused'}})
    await db.signup_challenges.update_one({'challenge_id': CID}, {'$set': {
        'challenge_id': CID, 'title': 'WELCOME CHALLENGE', 'description': 'Tap 1 to 20 as fast as you can. The fastest verified time wins.',
        'prize_type': 'cash', 'prize_amount_gbp': 50, 'prize_label': '£50 GIVEAWAY', 'prize_description': '', 'game_id': 'number_sequence',
        'game_config': {'target': 20}, 'attempts_allowed': 3, 'time_limit_s': 45, 'demo_enabled': True, 'demo_time_limit_s': 30, 'demo_max_runs': 3,
        'how_to_play': ['Tap the numbers in order from 1 to 20.', 'Wrong taps do not count, keep going.', 'Your score is your finish time: the fastest time wins.'],
        'start_at': now - timedelta(days=1), 'end_at': now + timedelta(days=30), 'eligible_signups_from': now - timedelta(days=1), 'uk_only': True,
        'winner_count': 1, 'prize_distribution': [{'rank': 1, 'prize': '£50'}], 'ranking_method': 'fastest_time', 'tie_break': 'earliest_finish',
        'whatsapp_url': 'https://chat.whatsapp.com/I6L15DZ3r9FD4NEaNPDesL', 'instagram_url': 'https://www.instagram.com/prizeleague',
        'share_url': 'https://www.prizeleague.co.uk', 'background_url': '', 'scorecard_bg_url': '', 'rules_text': RULES, 'legal_reviewed': True,
        'status': 'published', 'version': 1, 'published_at': now, 'updated_at': now,
    }, '$setOnInsert': {'created_at': now, 'created_by': 'seed'}}, upsert=True)
    for email, uid, country, phone in USERS:
        await db.users.update_one({'email': email}, {'$set': {
            'user_id': uid, 'email': email, 'name': 'Casey Tester' if country == 'GB' else 'Jordan Tester', 'role': 'user',
            'password_hash': hash_password('Player@12345'), 'method': 'email', 'country_of_residence': country, 'phone': phone,
            'phone_verified': True, 'phone_verified_at': now, 'email_verified': True, 'email_verified_at': now, 'terms_accepted_at': now,
            'dob': '1992-04-04', 'created_at': now, 'public_id': f'PLQA{uid[-4:].upper()}',
        }}, upsert=True)
        parts = await db.signup_challenge_participations.distinct('participation_id', {'user_id': uid})
        await db.signup_challenge_attempts.delete_many({'participation_id': {'$in': parts}})
        await db.signup_challenge_participations.delete_many({'user_id': uid})
    if '--enable' in sys.argv or '--disable' in sys.argv:
        await db.settings.update_one({'_id': 'signup_challenge'}, {'$set': {'enabled': '--enable' in sys.argv}}, upsert=True)
    print('seeded', CID, 'users:', [u[0] for u in USERS], 'flag:', (await db.settings.find_one({'_id': 'signup_challenge'}) or {}).get('enabled'))


asyncio.run(main())
