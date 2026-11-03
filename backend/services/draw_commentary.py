"""AI voice commentary for Draw Studio broadcasts: script (LLM) + speech (TTS). Uses only facts the studio sends."""
from __future__ import annotations

import os
import uuid

from dotenv import load_dotenv

load_dotenv()

LANGUAGES = ["English", "Hindi", "Telugu", "Tamil", "Urdu", "Punjabi", "Bengali", "Gujarati", "Spanish", "French",
             "German", "Italian", "Portuguese", "Polish", "Romanian", "Arabic", "Turkish"]
VOICES = ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"]
STYLES = {"energetic": "a high-energy TV game-show host who builds suspense and celebrates loudly",
          "classy": "a calm, classy national-lottery presenter: warm, clear and elegant",
          "fun": "a cheeky, funny host who makes light jokes while staying respectful"}
DEFAULTS = {"enabled": False, "language": "English", "voice": "onyx", "style": "energetic", "notes": "", "hd": False}


def commentary_settings(cfg: dict) -> dict:
    return {**DEFAULTS, **(cfg.get("commentary") or {})}


def clean_commentary(raw: dict) -> dict:
    out = dict(DEFAULTS)
    out["enabled"] = bool(raw.get("enabled"))
    out["hd"] = bool(raw.get("hd"))
    if raw.get("language") in LANGUAGES:
        out["language"] = raw["language"]
    if raw.get("voice") in VOICES:
        out["voice"] = raw["voice"]
    if raw.get("style") in STYLES:
        out["style"] = raw["style"]
    out["notes"] = str(raw.get("notes") or "")[:500]
    return out


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


async def write_line(cfg: dict, stage: str, data: dict) -> str:
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    system = (f"You are the live voice commentator of the Prize League Draw Studio, speaking as {STYLES[cfg['style']]}. "
              f"Write ONLY in {cfg['language']} (use its native script). Output spoken words only: no emojis, no stage directions, no markdown, no quotes. "
              "Use ONLY the facts provided. Never invent names, numbers or amounts, never promise prizes to anyone not named, never suggest the result is anything but random. "
              "Read ticket numbers digit by digit if they are long. Keep it to 1-3 short sentences (max 55 words) unless it is the intro or finale (max 90 words).")
    if cfg.get("notes"):
        system += f" Host notes from the organiser you may weave in naturally: {cfg['notes']}"
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"draw-commentary-{uuid.uuid4().hex}", system_message=system).with_model("openai", "gpt-5.4-mini")
    text = await chat.send_message(UserMessage(text=f"TASK: {TASKS[stage]}\n\nFACTS:\n{_facts(stage, data)}"))
    return str(text).strip()[:1200]


async def speak(cfg: dict, text: str) -> bytes:
    from emergentintegrations.llm.openai import OpenAITextToSpeech

    tts = OpenAITextToSpeech(api_key=os.environ["EMERGENT_LLM_KEY"])
    return await tts.generate_speech(text=text, model="tts-1-hd" if cfg.get("hd") else "tts-1", voice=cfg["voice"], response_format="mp3")
