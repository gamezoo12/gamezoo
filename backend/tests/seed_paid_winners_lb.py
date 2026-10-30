# Seed/cleanup a [TEST] closed leaderboard (skill) Paid World contest for paid-winners tests. Usage: python seed_paid_winners_lb.py seed|clean
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv('/app/backend/.env')
db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
CID = 'c_test_pw_lb'
USERS = [('ds_test_user_9', 'Jack Turner', 900, 0.95), ('ds_test_user_11', 'Oscar King', 800, 0.9), ('ds_test_user_0', 'Amelia Hart', 700, 0.8)]


async def seed():
    await clean()
    now = datetime.now(timezone.utc)
    await db.contests.insert_one({'contest_id': CID, 'title': '[TEST] PW Skill Leaderboard', 'status': 'closed', 'game_type': 'reaction',
                                  'engine_type': 'skill', 'prize_amount': 30.0, 'price': 1.0, 'is_test_contest': True,
                                  'end_date': now - timedelta(days=1), 'created_at': now - timedelta(days=5)})
    for i, (uid, name, pts, acc) in enumerate(USERS):
        await db.game_scores.insert_one({'score_id': f'sc_test_pw_{i}', 'contest_id': CID, 'ticket_id': f'tk_test_pw_{i}', 'user_id': uid,
                                         'user_name': name, 'points': pts, 'accuracy': acc, 'duration_ms': 10000 + i * 1000,
                                         'created_at': now - timedelta(days=2)})
    await db.winners.insert_one({'winner_id': 'w_test_pw_lb_1', 'contest_id': CID, 'user_id': 'ds_test_user_9', 'user_name': 'Jack Turner',
                                 'prize_amount': 20.0, 'prize_bonus_tokens': 5.0, 'drawn_at': now - timedelta(hours=20), 'paid_out': False})
    await db.winners.insert_one({'winner_id': 'w_test_pw_lb_2', 'contest_id': CID, 'user_id': 'ds_test_user_11', 'user_name': 'Oscar King',
                                 'prize_amount': 10.0, 'drawn_at': now - timedelta(hours=20), 'paid_out': False})


async def clean():
    await db.contests.delete_many({'contest_id': CID})
    await db.game_scores.delete_many({'contest_id': CID})
    await db.winners.delete_many({'contest_id': CID})
    await db.paid_winner_publication.delete_many({'contest_id': CID})


asyncio.run(seed() if sys.argv[1:] == ['seed'] else clean())
