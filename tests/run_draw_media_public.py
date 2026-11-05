# Standalone runner (outside the loopback-only pytest harness) for test_draw_studio_backdrop_commentary against the public URL.
import sys
import traceback

sys.path.insert(0, "/app/backend/tests")
import pymongo  # noqa: E402
import test_draw_studio_backdrop_commentary as t  # noqa: E402

db = pymongo.MongoClient(t.os.environ["MONGO_URL"])[t.os.environ["DB_NAME"]]
snap = db.settings.find_one({"_id": "draw_studio"}) or {}
admin = t._login("bachanta8@gmail.com", "Herts@910022")
player = t._login("player1@example.com", "Player@12345")
B, C = t.TestBackdrop(), t.TestCommentary()
cases = [
    ("backdrop_cycle", lambda: B.test_upload_get_delete_reupload(admin)),
    ("backdrop_415", lambda: B.test_non_image_415(admin)),
    ("backdrop_player", lambda: B.test_player_forbidden(player)),
    ("backdrop_anon", lambda: B.test_anon_unauth()),
    ("options", lambda: C.test_options(admin)),
    ("save_settings", lambda: C.test_save_settings_persist_and_sanitize(admin)),
    ("disabled_409_test_ok", lambda: C.test_disabled_409_and_test_stage_ok(admin)),
    ("override", lambda: C.test_override_bypasses_disabled(admin)),
] + [(f"stage_{s}", (lambda s=s: C.test_stages_enabled(admin, s))) for s in ["intro", "round", "mixing", "drawing", "reveal", "finale"]] + [
    ("invalid_stage", lambda: C.test_invalid_stage_422(admin)),
    ("commentary_player", lambda: C.test_player_forbidden(player)),
]
ok = 0
try:
    for name, fn in cases:
        try:
            fn()
            ok += 1
            print("PASS", name)
        except Exception:
            print("FAIL", name)
            traceback.print_exc()
finally:
    upd = {k: snap[k] for k in ("backdrop", "commentary", "volumes") if k in snap}
    if upd:
        db.settings.update_one({"_id": "draw_studio"}, {"$set": upd})
    print("restored", list(upd))
print(f"{ok}/{len(cases)} passed")
