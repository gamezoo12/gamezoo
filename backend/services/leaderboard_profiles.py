async def add_leaderboard_profiles(db, rows: list[dict]) -> None:
    user_ids = list({row.get('user_id') for row in rows if row.get('user_id')})
    profiles = {}
    if user_ids:
        async for user in db.users.find(
            {'user_id': {'$in': user_ids}},
            {'_id': 0, 'user_id': 1, 'profile_image_key': 1, 'profile_image_public': 1, 'free_world_avatar_id': 1},
        ):
            profiles[user['user_id']] = user
    for row in rows:
        profile = profiles.get(row.get('user_id'), {})
        row['profile_image_url'] = (
            f"/api/users/profile-picture/{row['user_id']}"
            if profile.get('profile_image_key') and profile.get('profile_image_public') else None
        )
        row['free_world_avatar_id'] = profile.get('free_world_avatar_id') or 'male-01'