import asyncio, os, sys
from datetime import datetime, timezone
sys.path.insert(0, '/app/backend')
from dotenv import load_dotenv; load_dotenv('/app/backend/.env')
from motor.motor_asyncio import AsyncIOMotorClient
from otp_verify import _code_hash
async def main():
    db = AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]
    for dest in sys.argv[1:]:
        await db.otp_approvals.insert_one({'code_hash': _code_hash(dest, '246810'), 'channel': 'email' if '@' in dest else 'sms', 'approved_at': datetime.now(timezone.utc)})
    print('seeded', sys.argv[1:])
asyncio.run(main())
