"""AI voice commentary for Draw Studio broadcasts: script (LLM) + speech (TTS). Uses only facts the studio sends."""
from __future__ import annotations

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
    "intro": "Open the broadcast: welcome viewers, name the draw, explain simply how it works (every eligible ticket enters the machine, it is mixed, and winning tickets are drawn at random by a certified random process), mention the total prize fund and how many tickets are in. Then introduce the first round.",
    "round": "Introduce this next round: its name, the prize per winner and how many winners. Tease the audience.",
    "loading": "Tickets are pouring into the machine now. Describe it with excitement and remind people to check their ticket numbers.",
    "mixing": "The machine is mixing every ticket. Build suspense, heartbeat is racing.",
    "drawing": "The draw is happening right now. Short dramatic build-up, no winner yet.",
    "reveal": "Announce the winning ticket number(s) and name(s) exactly as given, congratulate them warmly and say the prize.",
    "finale": "Close the show: recap every winner briefly, congratulate them, thank everyone who took part and invite them to the next draw.",
    "test": "Say a short friendly sound check as the Prize League Draw Studio host.",
}


async def write_lines(cfg: dict, stage: str, data: dict) -> list[dict]:
    """Returns [{host, text}] — one line for a solo host, 2-4 alternating banter lines for a duo."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    hosts = cast(cfg)
    people = "; ".join(f"{HOSTS[h]['name']} ({HOSTS[h]['gender']}): {HOSTS[h]['persona']}" for h in hosts)
    long_stage = stage in ("intro", "finale")
    if len(hosts) == 2:
        shape = (f"Write a short live exchange between co-hosts {HOSTS[hosts[0]]['name']} and {HOSTS[hosts[1]]['name']}: "
                 f"{'3-4' if long_stage else '2-3'} alternating lines, each max 30 words, with playful banter, reactions and hype. "
                 'Reply ONLY with JSON: [{"host": "<name>", "text": "<spoken line>"}].')
    else:
        shape = f"Write what {HOSTS[hosts[0]]['name']} says: 1-3 short sentences (max {90 if long_stage else 55} words). Reply ONLY with JSON: [{{\"host\": \"{HOSTS[hosts[0]]['name']}\", \"text\": \"<spoken line>\"}}]."
    system = (f"You write live commentary for the Prize League Draw Studio broadcast. Hosts: {people}. Overall tone: {STYLES[cfg['style']]}. "
              "Be genuinely entertaining: vivid, funny, suspenseful, celebrate winners, talk to the audience at home. "
              f"Write the spoken text ONLY in {cfg['language']} (use its native script). No emojis, no stage directions, no markdown inside the text. "
              "Use ONLY the facts provided. Never invent names, numbers or amounts, never promise prizes to anyone not named, never suggest the result is anything but random. "
              "Read ticket numbers digit by digit if they are long. " + shape)
    if cfg.get("notes"):
        system += f" Organiser notes you may weave in naturally: {cfg['notes']}"
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"draw-commentary-{uuid.uuid4().hex}", system_message=system).with_model("openai", "gpt-5.4-mini")
    raw = str(await chat.send_message(UserMessage(text=f"TASK: {TASKS[stage]}\n\nFACTS:\n{_facts(stage, data)}"))).strip()
    by_name = {HOSTS[h]["name"].lower(): h for h in hosts}
    try:
        items = json.loads(raw[raw.index("["): raw.rindex("]") + 1])
        lines = [{"host": by_name.get(str(i.get("host", "")).strip().lower(), hosts[n % len(hosts)]), "text": str(i.get("text", "")).strip()[:400]}
                 for n, i in enumerate(items) if str(i.get("text", "")).strip()]
    except (ValueError, AttributeError, TypeError):
        lines = [{"host": hosts[0], "text": raw[:600]}]
    return lines[:4] or [{"host": hosts[0], "text": raw[:600]}]


async def speak(cfg: dict, text: str, host: str | None = None) -> bytes:
    from emergentintegrations.llm.openai import OpenAITextToSpeech

    tts = OpenAITextToSpeech(api_key=os.environ["EMERGENT_LLM_KEY"])
    voice = HOSTS[host]["voice"] if host in HOSTS else cfg["voice"]
    return await tts.generate_speech(text=text, model="tts-1-hd" if cfg.get("hd") else "tts-1", voice=voice, response_format="mp3")
