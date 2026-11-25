import asyncio
from types import SimpleNamespace

from routers import world_routes


def test_tablet_and_desktop_header_spacing_are_saved_and_public(monkeypatch):
    class Settings:
        def __init__(self):
            self.values = {}

        async def update_one(self, query, update, **kwargs):
            self.values.update(update['$set'])

        async def find_one(self, query, projection):
            return dict(self.values)

    async def admin(_request):
        return {'user_id': 'admin'}

    async def mirror(values):
        pass

    settings = Settings()
    monkeypatch.setattr(world_routes, 'get_db', lambda: SimpleNamespace(world_settings=settings))
    monkeypatch.setattr(world_routes, 'require_super_admin', admin)
    monkeypatch.setattr(world_routes, '_mirror_selection_manifest', mirror)

    async def run():
        design = world_routes.WorldSelectionImagesInput(header_gap_tablet=80, header_gap_desktop=120,
                                                        title_gap_tablet=60, title_gap_desktop=90)
        await world_routes.admin_set_selection_images(design, None)
        saved = await world_routes.public_selection_images()
        assert (saved['header_gap_tablet'], saved['header_gap_desktop']) == (80, 120)
        assert (saved['title_gap_tablet'], saved['title_gap_desktop']) == (60, 90)

    asyncio.run(run())