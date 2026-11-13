"""Scoped reset for Signup Challenge QA users only (sc_qa_uk / sc_qa_intl): removes their participations/attempts.
Usage: python /app/tests/sc_reset_qa.py [status]"""
import os
import sys
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv('/app/backend/.env')
db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
UIDS = ['sc_qa_uk', 'sc_qa_intl']
if len(sys.argv) > 1 and sys.argv[1] == 'status':
    print('flag', db.settings.find_one({'_id': 'signup_challenge'}))
    print('published', [(c['challenge_id'], c['status']) for c in db.signup_challenges.find({}, {'challenge_id': 1, 'status': 1})])
    for p in db.signup_challenge_participations.find({'user_id': {'$in': UIDS}}, {'_id': 0, 'snapshot': 0}):
        print('part', p['user_id'], p['status'], p.get('attempts_used'), p.get('best_score'), p.get('dismissed_at'))
        for a in db.signup_challenge_attempts.find({'participation_id': p['participation_id']}, {'_id': 0, 'board': 0, 'expected': 0}):
            print('   att', a['attempt_no'], a['status'], a.get('score'), a.get('close_reason'))
    sys.exit()
parts = db.signup_challenge_participations.distinct('participation_id', {'user_id': {'$in': UIDS}})
print('attempts del', db.signup_challenge_attempts.delete_many({'participation_id': {'$in': parts}}).deleted_count)
print('parts del', db.signup_challenge_participations.delete_many({'user_id': {'$in': UIDS}, 'participation_id': {'$in': parts}}).deleted_count)
