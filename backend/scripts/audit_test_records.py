"""Read-only audit of test-marker records. Prints counts and writes matching IDs to a manifest for human review; never writes or deletes.

Usage: MONGO_URL=... DB_NAME=... python scripts/audit_test_records.py [--manifest /tmp/test_records_manifest.json]
"""
import argparse
import json
import os
import re

from pymongo import MongoClient, ReadPreference

TEST_EMAIL = re.compile(r'@(example\.com|test\.com|example\.test)$', re.I)
TEST_TITLE = re.compile(r'^TEST[_ ]')

parser = argparse.ArgumentParser()
parser.add_argument('--manifest', default='/tmp/test_records_manifest.json')
args = parser.parse_args()

db = MongoClient(os.environ['MONGO_URL'], serverSelectionTimeoutMS=8000,
                 read_preference=ReadPreference.SECONDARY_PREFERRED)[os.environ['DB_NAME']]

users = list(db.users.find({'email': TEST_EMAIL}, {'_id': 0, 'user_id': 1, 'created_at': 1}))
other_users = db.users.count_documents({'email': {'$not': TEST_EMAIL}})
contests = list(db.contests.find({'title': TEST_TITLE}, {'_id': 0, 'contest_id': 1, 'created_at': 1}))
user_ids = [u['user_id'] for u in users if u.get('user_id')]
dependents = {name: db[name].count_documents({'user_id': {'$in': user_ids}})
              for name in ('wallets', 'wallet_tx', 'tickets', 'orders', 'payment_transactions', 'notifications')}

print(f'test users: {len(users)} | other users: {other_users} | TEST_ contests: {len(contests)}')
print('records owned by test users:', dependents)
json.dump({'test_user_ids': user_ids, 'test_contest_ids': [c['contest_id'] for c in contests]}, open(args.manifest, 'w'))
print(f'manifest written to {args.manifest} (IDs only). Nothing was modified.')
