import asyncio

from services.leaderboard_profiles import add_leaderboard_profiles


class Users:
    def find(self, query, projection):
        async def results():
            for user in [
                {'user_id': 'public', 'profile_image_key': 'image', 'profile_image_public': True, 'free_world_avatar_id': 'female-01'},
                {'user_id': 'private', 'profile_image_key': 'image', 'profile_image_public': False},
            ]:
                yield user
        return results()


def test_leaderboard_profiles_respect_image_privacy_and_default_avatar():
    database = type('Database', (), {'users': Users()})()
    rows = [{'user_id': 'public'}, {'user_id': 'private'}, {'user_id': 'missing'}]
    asyncio.run(add_leaderboard_profiles(database, rows))
    assert rows[0]['profile_image_url'] == '/api/users/profile-picture/public'
    assert rows[0]['free_world_avatar_id'] == 'female-01'
    assert rows[1]['profile_image_url'] is None
    assert rows[1]['free_world_avatar_id'] == 'male-01'
    assert rows[2]['profile_image_url'] is None