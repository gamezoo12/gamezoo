#!/usr/bin/env python3
"""Seed one QA demo user/order before testing the Settings danger-zone UI."""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import dotenv_values
from pymongo import MongoClient

ROOT = Path('/app')
BACKEND = ROOT / 'backend'
sys.path.insert(0, str(BACKEND))
from auth import hash_password  # noqa: E402

RUN_ID = f'ui_{int(time.time())}'
USER_PASS = 'QaUiUserPass!234'

be = dotenv_values(BACKEND / '.env')
mongo_url = be['MONGO_URL']
db_name = (be.get('DB_NAME') or 'gamezoo').strip('"')
client = MongoClient(mongo_url)
db = client[db_name]
now = datetime.now(timezone.utc)
user_id = f'qa_ui_regular_{RUN_ID}'
contest_id = f'qa_ui_contest_{RUN_ID}'
order_id = f'qa_ui_order_{RUN_ID}'

db.users.update_one(
    {'email': f'qa_ui_wipe_{RUN_ID}@test.com'},
    {'$set': {
        'qa_run_id': RUN_ID,
        'user_id': user_id,
        'email': f'qa_ui_wipe_{RUN_ID}@test.com',
        'name': 'QA UI Demo User',
        'role': 'user',
        'method': 'email',
        'password_hash': hash_password(USER_PASS),
        'created_at': now,
    }},
    upsert=True,
)
db.wallets.update_one({'user_id': user_id}, {'$set': {'qa_run_id': RUN_ID, 'user_id': user_id, 'balance': 10.0, 'lifetime_topup': 10.0, 'lifetime_spend': 0.0}}, upsert=True)
db.contests.insert_one({'qa_run_id': RUN_ID, 'contest_id': contest_id, 'slug': f'qa-ui-wipe-{RUN_ID}', 'title': 'QA UI Demo Contest', 'status': 'live', 'price': 1.0, 'prize_amount': 50, 'tickets_sold': 1, 'end_date': now + timedelta(days=1)})
db.orders.insert_one({'qa_run_id': RUN_ID, 'order_id': order_id, 'user_id': user_id, 'items': [{'contest_id': contest_id, 'qty': 1, 'price': 1, 'prize_title': 'QA UI Demo Contest'}], 'total': 1.0, 'status': 'paid', 'method': 'wallet', 'created_at': now})
db.tickets.insert_one({'qa_run_id': RUN_ID, 'ticket_id': f'qa_ui_ticket_{RUN_ID}', 'order_id': order_id, 'user_id': user_id, 'contest_id': contest_id, 'ticket_number': 1, 'created_at': now})
db.leaderboard_entries.insert_one({'qa_run_id': RUN_ID, 'contest_id': contest_id, 'user_id': user_id, 'points': 444})

(ROOT / 'test_reports' / 'ui_wipe_run_id.txt').write_text(RUN_ID)
report = {'run_id': RUN_ID, 'seeded_user_id': user_id, 'seeded_order_id': order_id, 'seeded_contest_id': contest_id}
(ROOT / 'test_reports' / 'wipe_ui_seed_result.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2))
client.close()