import asyncio
from types import SimpleNamespace

from routers import auth_routes, country_routes


class Cursor:
    def __init__(self, rows):
        self.rows = rows

    async def to_list(self, *_args, **_kwargs):
        return [dict(row) for row in self.rows]


class Users:
    def __init__(self, rows):
        self.rows = rows

    async def find_one(self, query, *_args, **_kwargs):
        return next((dict(row) for row in self.rows if row.get('user_id') == query.get('user_id')), None)

    def find(self, query, *_args, **_kwargs):
        user_ids = query.get('user_id', {}).get('$in', [])
        return Cursor([row for row in self.rows if row.get('user_id') in user_ids])

    async def update_one(self, query, update, **_kwargs):
        row = next((row for row in self.rows if row.get('user_id') == query.get('user_id')), None)
        if not row:
            return SimpleNamespace(modified_count=0)
        if '$or' in query and not any(
            ('country_of_residence' not in row if condition['country_of_residence'].get('$exists') is False
             else row.get('country_of_residence') == condition.get('country_of_residence'))
            for condition in query['$or']
        ):
            return SimpleNamespace(modified_count=0)
        row.update(update.get('$set', {}))
        return SimpleNamespace(modified_count=1)


class Audit:
    def __init__(self):
        self.rows = []

    async def insert_one(self, row):
        self.rows.append(dict(row))


def test_legacy_terms_accepted_user_gets_uk_default_but_new_user_does_not():
    row = {'user_id': 'legacy', 'role': 'user', 'terms_accepted_at': 'accepted'}
    db = SimpleNamespace(users=Users([row]))
    user = dict(row)

    asyncio.run(auth_routes._default_legacy_user_country(db, user))

    assert user['country_of_residence'] == 'GB'
    assert row['country_set_source'] == 'legacy_uk_default'

    new_user = {'user_id': 'new', 'role': 'user'}
    asyncio.run(auth_routes._default_legacy_user_country(db, new_user))
    assert 'country_of_residence' not in new_user


def test_admin_bulk_country_changes_are_audited_and_skip_erased_users(monkeypatch):
    db = SimpleNamespace(
        users=Users([
            {'user_id': 'one'},
            {'user_id': 'two', 'country_of_residence': 'FR'},
            {'user_id': 'erased', 'erased': True},
        ]),
        country_policy_audit=Audit(),
    )

    async def admin(_request):
        return {'user_id': 'admin-1', 'email': 'admin@example.test', 'role': 'admin'}

    monkeypatch.setattr(country_routes, 'require_admin', admin)
    monkeypatch.setattr(country_routes, 'get_db', lambda: db)
    payload = country_routes.BulkAdminUserCountryInput(
        user_ids=['one', 'two', 'erased'], country='GB', reason='Correct legacy user country',
    )

    result = asyncio.run(country_routes.admin_bulk_set_user_country(payload, SimpleNamespace()))

    assert (result['succeeded'], result['skipped'], result['failed']) == (2, 1, 0)
    assert db.users.rows[0]['country_of_residence'] == 'GB'
    assert db.users.rows[1]['country_of_residence'] == 'GB'
    assert db.users.rows[2].get('country_of_residence') is None
    assert len(db.country_policy_audit.rows) == 2
