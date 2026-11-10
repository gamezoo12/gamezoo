import os, time, requests, concurrent.futures as cf
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
H = {"Authorization": f"Bearer {os.environ['EMERGENT_LLM_KEY']}", "Content-Type": "application/json"}
# Fal Universal Key supports queue inference through Emergent proxy, not Platform APIs.
B = os.environ.get("INTEGRATION_PROXY_URL", "https://integrations.emergentagent.com").rstrip("/") + "/api/v1/fal"
OUT = "/app/frontend/public/santa-songs"
os.makedirs(OUT, exist_ok=True)
STYLE = ("Jolly festive Christmas pop song, warm deep friendly male Santa Claus lead vocal singing clearly, smooth and melodic, "
         "sleigh bells, glockenspiel, upbeat swing, cheerful and magical, short radio jingle")
LYRICS = [
    "[Verse]\nHo ho ho, it's Santa here\nWelcome to Prize League, my dear\n[Chorus]\nJingle all the way, play and win today\nMerry Christmas, hip hooray",
    "[Verse]\nSleigh bells ringing through the snow\nPrize League lights are all aglow\n[Chorus]\nCome on, champion, take your shot\nHo ho ho, give it all you've got",
    "[Verse]\nTwinkle, twinkle, golden star\nLook how brilliant you are\n[Chorus]\nPrize League magic in the air\nHappy New Year everywhere",
    "[Verse]\nRudolph's nose is shining bright\nGuiding you to win tonight\n[Chorus]\nHo ho ho, the levels call\nMerry Christmas, one and all",
    "[Verse]\nUnwrap a level, like a gift\nLet the festive spirit lift\n[Chorus]\nPrize League, Prize League, have some fun\nHo ho ho, the race is on",
    "[Verse]\nCountdown clock is ticking near\nFireworks for the brand new year\n[Chorus]\nRaise your game and raise a cheer\nPrize League champions, Santa's here",
    "[Verse]\nElves are dancing, reindeer fly\nSnowflakes sparkle in the sky\n[Chorus]\nPlay along and sing with me\nHo ho ho, so merrily",
    "[Verse]\nCocoa warm and spirits high\nTrophies waiting, reach the sky\n[Chorus]\nPrize League friends, come gather round\nHo ho ho, hear Santa's sound",
    "[Verse]\nDeck the map with lights of gold\nBrave and clever, strong and bold\n[Chorus]\nWin a prize and smile so wide\nSanta's sleigh is by your side",
    "[Verse]\nHappy New Year, merry cheer\nThe best of times are finally here\n[Chorus]\nPrize League, let the party start\nHo ho ho, with all my heart",
]


def get(url):
    for i in range(5):
        try:
            return requests.get(url, headers=H, timeout=60)
        except requests.RequestException:
            time.sleep(2 ** i)
    raise RuntimeError("poll failed")


def gen(i):
    path = f"{OUT}/song-{i + 1}.mp3"
    if os.path.exists(path):
        return
    r = requests.post(f"{B}/proxy", headers={**H, "X-Fal-Target-Url": "https://queue.fal.run/fal-ai/minimax-music/v2"},
                      json={"prompt": STYLE, "lyrics_prompt": LYRICS[i], "audio_setting": {"format": "mp3", "sample_rate": 44100, "bitrate": 128000}}, timeout=60)
    r.raise_for_status()
    sub = r.json(); deadline = time.time() + 900
    while time.time() < deadline:
        st = (get(sub["status_url"]).json().get("status") or "").upper()
        if st in ("COMPLETED", "OK"):
            res = get(sub["response_url"]).json()
            url = res["audio"]["url"]
            open(path, "wb").write(requests.get(url, timeout=120).content)
            print(i + 1, os.path.getsize(path), flush=True)
            return
        if st in ("FAILED", "ERROR", "CANCELLED"):
            raise RuntimeError(f"{i + 1} failed")
        time.sleep(4)
    raise RuntimeError("timeout")


with cf.ThreadPoolExecutor(5) as ex:
    for f in cf.as_completed([ex.submit(gen, i) for i in range(10)]):
        try:
            f.result()
        except Exception as e:
            print("ERR", e, flush=True)
print("DONE")
