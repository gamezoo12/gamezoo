import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from routers import world_routes


class WorldSettings:
    def __init__(self):
        self.document = None

    async def find_one(self, *_args, **_kwargs):
        return dict(self.document) if self.document else None

    async def update_one(self, query, update, upsert=False):
        self.document = {**(self.document or query), **update["$set"]}


class Users:
    def __init__(self):
        self.updated = None

    async def update_one(self, query, update):
        self.updated = (query, update)


def test_admin_can_configure_free_world_intro_media(monkeypatch):
    settings = WorldSettings()
    db = SimpleNamespace(world_settings=settings)

    async def admin(_request):
        return {"user_id": "admin-1"}

    monkeypatch.setattr(world_routes, "get_db", lambda: db)
    monkeypatch.setattr(world_routes, "require_super_admin", admin)

    initial = asyncio.run(world_routes.public_map_theme())
    assert initial["intro_media_url"] is None
    assert initial["intro_media_type"] is None

    payload = world_routes.MapThemeInput(
        theme="festive", effects=True,
        intro_media_url="https://cdn.example/image.png", intro_media_type="image",
    )
    result = asyncio.run(world_routes.admin_set_map_theme(payload, object()))
    public = asyncio.run(world_routes.public_map_theme())

    assert result["intro_media_url"] == "https://cdn.example/image.png"
    assert result["intro_media_type"] == "image"
    assert public["intro_media_url"] == "https://cdn.example/image.png"
    assert public["intro_media_type"] == "image"


def test_player_avatar_is_validated_and_saved_to_the_account(monkeypatch):
    users = Users()
    db = SimpleNamespace(users=users, world_settings=WorldSettings())

    async def current_user(_request):
        return {"user_id": "player-1", "free_world_owned_avatars": ["female-05"], "free_world_avatar_id": "male-01"}

    monkeypatch.setattr(world_routes, "get_db", lambda: db)
    monkeypatch.setattr(world_routes, "get_current_user", current_user)

    result = asyncio.run(world_routes.set_free_world_avatar(
        world_routes.FreeWorldAvatarInput(avatar_id="female-05"), object()
    ))

    assert result == {"avatar_id": "female-05"}
    assert users.updated == ({"user_id": "player-1"}, {"$set": {"free_world_avatar_id": "female-05"}, "$addToSet": {"free_world_avatar_history": {"$each": ["male-01", "female-05"]}}})


def test_admin_catalog_releases_exactly_configured_avatar_offers(monkeypatch):
    settings = WorldSettings()
    db = SimpleNamespace(world_settings=settings)

    async def admin(_request):
        return {"user_id": "admin-1"}

    monkeypatch.setattr(world_routes, "get_db", lambda: db)
    monkeypatch.setattr(world_routes, "require_super_admin", admin)
    offers = [
        {"avatar_id": avatar_id, "released": avatar_id in {"male-01", "female-01"},
         "price_type": "free" if avatar_id == "male-01" else "wallet", "price": 0 if avatar_id == "male-01" else 40}
        for avatar_id in world_routes.FREE_WORLD_AVATAR_IDS
    ]

    result = asyncio.run(world_routes.admin_set_free_world_avatar_catalog(
        world_routes.FreeWorldAvatarCatalogInput(offers=offers), object()
    ))

    released = [offer for offer in result["offers"] if offer["released"]]
    assert len(result["offers"]) == 58
    assert {offer["avatar_id"] for offer in released} == {"male-01", "female-01"}
    assert next(offer for offer in released if offer["avatar_id"] == "female-01")["price_type"] == "wallet"


def test_catalog_adds_new_avatars_without_overwriting_existing_offers(monkeypatch):
    settings = WorldSettings()
    settings.document = {"offers": [{"avatar_id": "male-01", "released": True, "price_type": "wallet", "price": 7}]}
    offers = asyncio.run(world_routes._free_world_avatar_offers(SimpleNamespace(world_settings=settings)))
    assert len(offers) == 58
    assert offers[0]["price"] == 7
    expected_released = {"male-01", "legacy-classic", "legacy-santa"}
    assert {offer["avatar_id"] for offer in offers if offer["released"]} == expected_released


def test_paused_unity_catalog_entries_stay_unreleased_even_if_previously_saved():
    settings = WorldSettings()
    settings.document = {"offers": [{"avatar_id": "unity-female-08", "released": True, "price_type": "free", "price": 0}]}
    offers = asyncio.run(world_routes._free_world_avatar_offers(SimpleNamespace(world_settings=settings)))
    unity_offer = next(offer for offer in offers if offer["avatar_id"] == "unity-female-08")
    assert unity_offer["released"] is False


def test_paused_unity_avatar_cannot_be_selected():
    with pytest.raises(HTTPException) as error:
        asyncio.run(world_routes.set_free_world_avatar(
            world_routes.FreeWorldAvatarInput(avatar_id="unity-female-08"), object()
        ))
    assert error.value.status_code == 404