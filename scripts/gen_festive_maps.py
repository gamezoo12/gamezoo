import os, sys, time, requests, concurrent.futures as cf
from io import BytesIO
from PIL import Image

H = {"Authorization": f"Bearer {os.environ['EMERGENT_LLM_KEY']}", "Content-Type": "application/json"}
B = os.environ.get("INTEGRATION_PROXY_URL", "https://integrations.emergentagent.com").rstrip("/") + "/api/v1/fal"
OUT = "/app/frontend/src/world/assets/festive"
os.makedirs(OUT, exist_ok=True)
BASE = ("Ultra detailed 4K vertical fantasy game world map illustration, magical painterly style, rich vibrant colours, glowing lights, "
        "a clear winding path that starts at the bottom centre and snakes up to a landmark at the top, open space along the path for level markers, "
        "festive Christmas and New Year celebration theme, no text, no letters, no numbers, no logos, no people close-up. Scene: ")
SCENES = [
    "snowy enchanted forest village with glowing gingerbread cottages, candy-cane lamp posts, a giant decorated Christmas tree at the top, gold New Year fireworks in a starry sky",
    "Santa's workshop valley with elves' toy factories, red and gold presents along a frozen river, reindeer stables, a glowing clock tower striking midnight at the top",
    "ice crystal palace on a mountain peak, frozen lakes with skaters' lanterns, aurora borealis, silver and violet fireworks bursting above the palace",
    "cosy alpine Christmas market town with wooden stalls, string lights, mulled-wine steam, a big ferris wheel and New Year sparkler bursts at the top",
    "candy kingdom made of gingerbread, peppermint hills, chocolate river, sugar-plum trees, a candy castle with fireworks overhead",
    "northern lights tundra with glowing igloos, polar bears with scarves, a lighthouse wrapped in fairy lights, emerald aurora and gold fireworks",
    "magical midnight city by a frozen river, Victorian rooftops with snow, giant New Year countdown clock tower at the top, colourful fireworks over the bridges",
    "snow globe wonderland with floating islands linked by bridges of lights, toy soldiers, nutcracker castle at the top, sparkling confetti in the sky",
    "royal winter castle grounds with lantern-lit gardens, ice sculptures, a golden sleigh, champagne-gold fireworks and a full moon",
    "grand festive finale: a mountain kingdom with a huge glowing star on the summit castle, rainbow fireworks, snowy pine forests and lantern-lit path",
]


def get(url, deadline):
    for i in range(5):
        try:
            return requests.get(url, headers=H, timeout=60)
        except requests.RequestException:
            time.sleep(2 ** i)
    raise RuntimeError("poll failed")


def gen(i):
    path = f"{OUT}/champ-{i + 1}.jpg"
    if os.path.exists(path):
        return path
    r = requests.post(f"{B}/proxy", headers={**H, "X-Fal-Target-Url": "https://queue.fal.run/fal-ai/nano-banana-pro"},
                      json={"prompt": BASE + SCENES[i], "resolution": "4K", "aspect_ratio": "2:3", "output_format": "png", "num_images": 1}, timeout=60)
    r.raise_for_status()
    sub = r.json(); deadline = time.time() + 900
    while time.time() < deadline:
        st = get(sub["status_url"], deadline).json().get("status", "").upper()
        if st in ("COMPLETED", "OK"):
            res = get(sub["response_url"], deadline).json()
            img = Image.open(BytesIO(requests.get(res["images"][0]["url"], timeout=120).content)).convert("RGB")
            img.save(path, "JPEG", quality=82, optimize=True, progressive=True)
            print(i + 1, img.size, os.path.getsize(path), flush=True)
            return path
        if st in ("FAILED", "ERROR", "CANCELLED"):
            raise RuntimeError(f"{i + 1} failed")
        time.sleep(4)
    raise RuntimeError("timeout")


with cf.ThreadPoolExecutor(5) as ex:
    for f in cf.as_completed([ex.submit(gen, i) for i in range(10)]):
        try: f.result()
        except Exception as e: print("ERR", e, flush=True)
print("DONE")
