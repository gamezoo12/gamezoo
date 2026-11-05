"""AI voice commentary for Draw Studio broadcasts: script (LLM) + speech (TTS). Uses only facts the studio sends."""
from __future__ import annotations

import asyncio
import json
import os
import uuid

from dotenv import load_dotenv

load_dotenv()

LANGUAGES = ["English", "Hindi", "Telugu", "Tamil", "Urdu", "Punjabi", "Bengali", "Gujarati", "Spanish", "French",
             "German", "Italian", "Portuguese", "Polish", "Romanian", "Arabic", "Turkish"]
VOICES = ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"]
HOSTS = {
    "max": {"name": "Max", "gender": "male", "voice": "onyx", "persona": "smooth, confident showman with a booming voice who loves a dramatic pause"},
    "leo": {"name": "Leo", "gender": "male", "voice": "echo", "persona": "cheeky, quick-witted joker who teases his co-host and the audience"},
    "sophia": {"name": "Sophia", "gender": "female", "voice": "nova", "persona": "warm, glamorous presenter who makes every winner feel like a star"},
    "ruby": {"name": "Ruby", "gender": "female", "voice": "shimmer", "persona": "bubbly, high-energy hype queen who can't contain her excitement"},
}
STYLES = {"energetic": "high-energy TV game-show hosts who build suspense and celebrate loudly",
          "classy": "calm, classy national-lottery presenters: warm, clear and elegant",
          "fun": "cheeky, funny hosts who crack light jokes and banter while staying respectful"}
DEFAULTS = {"enabled": False, "language": "English", "mode": "duo", "host": "max", "duo": ["max", "sophia"], "voice": "onyx",
            "style": "energetic", "notes": "", "hd": False}


def commentary_settings(cfg: dict) -> dict:
    return clean_commentary({**DEFAULTS, **(cfg.get("commentary") or {})})


def clean_commentary(raw: dict) -> dict:
    out = dict(DEFAULTS)
    out["enabled"] = bool(raw.get("enabled"))
    out["hd"] = bool(raw.get("hd"))
    if raw.get("language") in LANGUAGES:
        out["language"] = raw["language"]
    if raw.get("mode") in ("solo", "duo"):
        out["mode"] = raw["mode"]
    if raw.get("host") in HOSTS:
        out["host"] = raw["host"]
    duo = [h for h in (raw.get("duo") or []) if h in HOSTS][:2]
    if len(duo) == 2 and duo[0] != duo[1]:
        out["duo"] = duo
    if raw.get("style") in STYLES:
        out["style"] = raw["style"]
    out["voice"] = HOSTS[out["host"]]["voice"]
    out["notes"] = str(raw.get("notes") or "")[:500]
    return out


def cast(cfg: dict) -> list[str]:
    return cfg["duo"] if cfg["mode"] == "duo" else [cfg["host"]]


def _money(v) -> str:
    try:
        return f"£{float(v):,.2f}".replace(".00", "")
    except (TypeError, ValueError):
        return "£0"


def _facts(stage: str, d: dict) -> str:
    lines = [f"Draw: {d.get('contest_title') or 'Prize League draw'}",
             f"Round {int(d.get('round_index', 0)) + 1} of {d.get('total_rounds', 1)}: {d.get('round_name') or ''}",
             f"Prize per winner this round: {_money(d.get('prize_amount'))}; winners this round: {d.get('num_winners', 1)}",
             f"Tickets in the pool: {d.get('eligible', 0)}; total prize fund across all rounds: {_money(d.get('total_prize'))}"]
    if d.get("winners"):
        lines.append("Winners just drawn: " + "; ".join(f"ticket #{w.get('ticket_number')} {w.get('display_name') or ''}".strip() for w in d["winners"][:20]))
    if d.get("all_winners"):
        lines.append("All winners tonight: " + "; ".join(f"{w.get('round_name')}: #{w.get('ticket_number')} {w.get('display_name') or ''}" for w in d["all_winners"][:40]))
    if d.get("mode") in ("preview", "replay"):
        lines.append("This is a " + ("rehearsal (simulated, not official)" if d["mode"] == "preview" else "replay of the official result"))
    return "\n".join(lines)


TASKS = {
    "intro": "OPEN the show (the only stage where you greet viewers): welcome everyone, name the draw, explain simply how it works (every eligible ticket goes into the machine, it gets mixed, and winners are picked at random by a certified random process), mention the total prize fund and how many tickets are in, then tease the first round.",
    "round": "We are mid-show (do NOT greet or welcome again). Introduce this next round: its name, prize per winner and number of winners. Tease the audience.",
    "loading": "Mid-show, no greeting. Tickets are pouring into the machine right now. React to it and tell people to grab their ticket numbers.",
    "mixing": "Mid-show, no greeting. The machine is mixing every ticket. Build suspense, react to the spinning, joke about nerves.",
    "drawing": "Mid-show, no greeting. The draw is happening this second. Short, breathless, dramatic build-up. No winner yet.",
    "reveal": "Mid-show, no greeting. Announce the winning ticket number(s) and name(s) exactly as given, go wild celebrating, congratulate them and say the prize.",
    "finale": "Close the show: recap every winner briefly, celebrate, thank everyone who played and invite them to the next draw.",
    "test": "A quick, funny sound check: the hosts say hi to the organiser, joke around and show off their personality in a few seconds.",
}
TEST_FACTS = {"contest_title": "Prize League Sample Draw", "round_name": "Grand Prize", "prize_amount": 500, "num_winners": 1, "eligible": 240, "total_prize": 600}
MOODS = {"excited": "bursting with excitement, fast and loud", "laughing": "laughing out loud mid-sentence, giggly and playful",
         "teasing": "cheeky and teasing, a smile in the voice", "suspense": "low, slow, whispery suspense that builds",
         "warm": "warm, heartfelt and sincere", "shocked": "genuinely astonished, gasping"}
ACTIONS = ["talk", "laugh", "celebrate", "wave", "point", "suspense"]


async def write_lines(cfg: dict, stage: str, data: dict) -> list[dict]:
    """Returns [{host, text, mood, action}] — one line for a solo host, 2-4 alternating banter lines for a duo."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    if stage == "test":
        data = {**data, **TEST_FACTS}
    hosts = cast(cfg)
    people = "; ".join(f"{HOSTS[h]['name']} ({HOSTS[h]['gender']}): {HOSTS[h]['persona']}" for h in hosts)
    long_stage = stage in ("intro", "finale")
    item = '{"host": "<name>", "text": "<spoken line>", "mood": "<' + "|".join(MOODS) + '>", "action": "<' + "|".join(ACTIONS) + '>"}'
    if len(hosts) == 2:
        shape = (f"Write a live exchange between co-hosts {HOSTS[hosts[0]]['name']} and {HOSTS[hosts[1]]['name']}: "
                 f"{'3-4' if long_stage else '2-3'} alternating lines, each max 28 words. They interrupt, react to and tease each other like real TV presenters.")
    else:
        shape = f"Write 1-2 lines for {HOSTS[hosts[0]]['name']} (max {80 if long_stage else 45} words in total), talking to the audience at home."
    system = (f"You write LIVE TV commentary for the Prize League Draw Studio. Hosts: {people}. Overall tone: {STYLES[cfg['style']]}. "
              "Make it sound like real people talking off the cuff, not a script: contractions, short punchy sentences, natural reactions "
              "(\"Ooh!\", \"Ha!\", \"No way!\", \"Come on!\"), laughter where it fits, a running joke or callback, talk directly to viewers. "
              "Never sound like an announcement or repeat the same phrasing. "
              f"Write the spoken text ONLY in {cfg['language']} (use its native script). No emojis, no stage directions or brackets inside the text. "
              "Use ONLY the facts provided. Never invent names, numbers or amounts, never promise prizes to anyone not named, never suggest the result is anything but random. "
              "Read ticket numbers digit by digit if they are long. " + shape +
              f" For each line pick the voice mood and a body action (laugh when joking, celebrate on wins, point at the machine, suspense while drawing). Reply ONLY with a JSON array of {item}.")
    if cfg.get("notes"):
        system += f" Organiser notes you may weave in naturally: {cfg['notes']}"
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"draw-commentary-{uuid.uuid4().hex}", system_message=system).with_model("openai", "gpt-5.4-mini")
    raw = str(await chat.send_message(UserMessage(text=f"TASK: {TASKS[stage]}\n\nFACTS:\n{_facts(stage, data)}"))).strip()
    by_name = {HOSTS[h]["name"].lower(): h for h in hosts}
    try:
        items = json.loads(raw[raw.index("["): raw.rindex("]") + 1])
        lines = [{"host": by_name.get(str(i.get("host", "")).strip().lower(), hosts[n % len(hosts)]), "text": str(i.get("text", "")).strip()[:400],
                  "mood": i.get("mood") if i.get("mood") in MOODS else "excited", "action": i.get("action") if i.get("action") in ACTIONS else "talk"}
                 for n, i in enumerate(items) if str(i.get("text", "")).strip()]
    except (ValueError, AttributeError, TypeError):
        lines = []
    return lines[:4] or [{"host": hosts[0], "text": raw[:600], "mood": "excited", "action": "talk"}]


def _expressive(text: str, voice: str, instructions: str) -> bytes:
    from litellm import speech

    r = speech(model="openai/gpt-4o-mini-tts", input=text, voice=voice, instructions=instructions, api_key=os.environ["EMERGENT_LLM_KEY"],
               api_base=os.getenv("INTEGRATION_PROXY_URL", "https://integrations.emergentagent.com") + "/llm", custom_llm_provider="openai")
    return r.content


async def speak(cfg: dict, text: str, host: str | None = None, mood: str = "excited") -> bytes:
    """Expressive voice (can laugh, whisper, react); falls back to the standard voice if it is unavailable."""
    h = HOSTS.get(host) or HOSTS[cfg["host"]]
    instructions = (f"You are {h['name']}, a live TV game-show presenter: {h['persona']}. Delivery: {MOODS.get(mood, MOODS['excited'])}. "
                    f"Sound spontaneous and human, with natural breaths, emphasis and real laughter where the text is funny. Speak in {cfg['language']}.")
    try:
        return await asyncio.to_thread(_expressive, text, h["voice"], instructions)
    except Exception:  # noqa: BLE001
        from emergentintegrations.llm.openai import OpenAITextToSpeech

        tts = OpenAITextToSpeech(api_key=os.environ["EMERGENT_LLM_KEY"])
        return await tts.generate_speech(text=text, model="tts-1-hd" if cfg.get("hd") else "tts-1", voice=h["voice"], response_format="mp3")
