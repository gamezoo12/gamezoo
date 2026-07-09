"""Seed 50 contests + admin user into MongoDB (idempotent)."""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
sys.path.insert(0, str(ROOT_DIR))

from auth import hash_password  # noqa: E402
from models import Contest, SkillQuestion, User, new_id  # noqa: E402

IMAGES = {
    'scratch': 'https://images.pexels.com/photos/7267577/pexels-photo-7267577.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'cash': 'https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'cash_coins': 'https://images.pexels.com/photos/15633962/pexels-photo-15633962.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'car': 'https://images.pexels.com/photos/19240616/pexels-photo-19240616.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'car2': 'https://images.pexels.com/photos/17081564/pexels-photo-17081564.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'vacuum': 'https://images.pexels.com/photos/14979011/pexels-photo-14979011.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'hair': 'https://images.pexels.com/photos/9462148/pexels-photo-9462148.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'tech': 'https://images.pexels.com/photos/973406/pexels-photo-973406.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    'ipad': 'https://images.unsplash.com/photo-1468495244123-6c6c332eeece?auto=format&fit=crop&w=800&q=80',
    'holiday': 'https://images.pexels.com/photos/27064826/pexels-photo-27064826.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
}

QBANK = [
    ('What is 12 + 7?', ['17', '19', '21', '23'], '19', 'math'),
    ('What is 8 × 6?', ['42', '46', '48', '54'], '48', 'math'),
    ('What is 100 ÷ 4?', ['20', '25', '30', '40'], '25', 'math'),
    ('What is 15 - 8?', ['5', '6', '7', '8'], '7', 'math'),
    ('What is 9 × 9?', ['72', '81', '89', '99'], '81', 'math'),
    ('Capital city of France?', ['Rome', 'Madrid', 'Paris', 'Berlin'], 'Paris', 'trivia'),
    ('Which planet is closest to the Sun?', ['Venus', 'Mercury', 'Earth', 'Mars'], 'Mercury', 'trivia'),
    ('How many continents are there?', ['5', '6', '7', '8'], '7', 'trivia'),
    ('Who painted the Mona Lisa?', ['Van Gogh', 'Picasso', 'Da Vinci', 'Monet'], 'Da Vinci', 'trivia'),
    ('What colour do you get by mixing red + white?', ['Purple', 'Pink', 'Orange', 'Brown'], 'Pink', 'trivia'),
    ('How many sides does a hexagon have?', ['5', '6', '7', '8'], '6', 'trivia'),
    ('Largest ocean on Earth?', ['Atlantic', 'Indian', 'Arctic', 'Pacific'], 'Pacific', 'trivia'),
    ('Which word means “happy”?', ['Gloomy', 'Joyful', 'Bitter', 'Weary'], 'Joyful', 'word'),
    ('Opposite of “hot”?', ['Warm', 'Cool', 'Cold', 'Icy'], 'Cold', 'word'),
    ('What is 25% of 200?', ['25', '40', '50', '75'], '50', 'math'),
    ('Square root of 64?', ['6', '7', '8', '9'], '8', 'math'),
    ('What year did WWII end?', ['1943', '1945', '1947', '1950'], '1945', 'trivia'),
    ('Chemical symbol for gold?', ['Go', 'Gd', 'Au', 'Ag'], 'Au', 'trivia'),
    ('Fastest land animal?', ['Lion', 'Cheetah', 'Horse', 'Leopard'], 'Cheetah', 'trivia'),
    ('Days in a leap year?', ['364', '365', '366', '367'], '366', 'trivia'),
]

PRIZE_POOL = [
    (50, 100),
    (100, 150),
    (250, 300),
    (500, 600),
    (100, 150),
    (250, 300),
]

CATS = [
    ('prize-draws', 'Prize Draws'),
    ('instant-wins', 'Instant Wins'),
    ('jackpot', 'Jackpot'),
    ('new-games', 'New Game'),
]
IMG_LIST = list(IMAGES.values())


def days_from_now(d: int) -> datetime:
    return (datetime.now(timezone.utc) + timedelta(days=d)).replace(hour=21, minute=0, second=0, microsecond=0)


async def main():
    mongo_url = os.environ['MONGO_URL']
    db_name = os.environ.get('DB_NAME', 'gamezoo')
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    # Admin user
    admin_email = 'bachanta8@gmail.com'
    existing = await db.users.find_one({'email': admin_email})
    if not existing:
        admin = User(
            email=admin_email,
            name='Admin',
            password_hash=hash_password('Herts@910022'),
            method='email',
            role='admin',
        )
        await db.users.insert_one(admin.model_dump())
        print(f'✓ Created admin user: {admin_email}')
    else:
        # Ensure role is admin and reset password to requested
        await db.users.update_one(
            {'email': admin_email},
            {'$set': {
                'role': 'admin',
                'password_hash': hash_password('Herts@910022'),
                'method': 'email',
            }}
        )
        print(f'✓ Updated admin user: {admin_email}')

    # Contests
    existing_count = await db.contests.count_documents({})
    if existing_count >= 50:
        print(f'✓ Contests already seeded ({existing_count})')
    else:
        await db.contests.delete_many({})
        contests = []
        for i in range(50):
            prize, tickets = PRIZE_POOL[i % len(PRIZE_POOL)]
            cat, tag = CATS[i % len(CATS)]
            qb = QBANK[i % len(QBANK)]
            is_big = prize >= 250
            c = Contest(
                slug=f'contest-{i + 1}',
                title=f'Win £{prize} Cash – Contest #{i + 1}',
                subtitle=(f'£{prize} tax-free cash prize' if is_big else f'£{prize} cash prize'),
                category=cat,
                tag=tag,
                price=1.0,
                tickets_total=tickets,
                prize_amount=float(prize),
                end_date=days_from_now(30 + (i % 60)),
                image=IMG_LIST[i % len(IMG_LIST)],
                jackpot=is_big,
                featured=i < 3,
                skill_question=SkillQuestion(q=qb[0], options=qb[1], answer=qb[2], type=qb[3]),
                status='live',
            )
            contests.append(c.model_dump())
        await db.contests.insert_many(contests)
        print(f'✓ Seeded {len(contests)} contests')

    # Indexes
    await db.users.create_index('email', unique=True)
    await db.contests.create_index('slug', unique=True)
    await db.user_sessions.create_index('session_token', unique=True)
    print('✓ Indexes ensured')

    client.close()


if __name__ == '__main__':
    asyncio.run(main())
