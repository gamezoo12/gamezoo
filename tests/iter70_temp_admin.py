# Create/delete a temporary plain 'admin' user for UI sidebar checks: python3 iter70_temp_admin.py create|delete
import os
import sys
from datetime import datetime, timezone
sys.path.insert(0, '/app/backend')
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
from pymongo import MongoClient
from auth import hash_password

db = MongoClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
UID, EMAIL = 'user_test_iter70_admin', 'test_iter70_admin@example.com'
if sys.argv[1] == 'create':
    db.users.delete_one({'user_id': UID})
    db.users.insert_one({'user_id': UID, 'email': EMAIL, 'name': 'TEST_iter70 admin', 'role': 'admin', 'method': 'email',
                         'password_hash': hash_password('TempStaff@12345'), 'email_verified': True, 'must_change_password': False,
                         'terms_accepted_at': datetime.now(timezone.utc), 'created_at': datetime.now(timezone.utc)})
    print('created')
else:
    print('deleted', db.users.delete_one({'user_id': UID}).deleted_count)
