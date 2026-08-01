#!/usr/bin/env python3
"""Focused regression setup + API assertions for token checkout/play routing.

Creates a live skill-game contest, tops up the named test account via admin
wallet adjust, performs one direct checkout, and validates the response schema
plus my-tickets enrichment used by the UI ticket cards.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests


APP = Path('/app')
OUT = APP / 'test_reports' / 'bug_iter34_api_results.json'
ADMIN_EMAIL = 'bachanta8@gmail.com'
ADMIN_PASSWORD = 'Herts@910022'


def _backend_url() -> str:
    env_path = APP / 'frontend' / '.env'
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.split('=', 1)[1].strip().strip('"').rstrip('/')
    return os.environ.get('REACT_APP_BACKEND_URL', 'https://contest-arena-16.preview.emergentagent.com').rstrip('/')


BASE = _backend_url()


def req(method: str, path: str, *, token: str | None = None, **kwargs) -> requests.Response:
    headers = kwargs.pop('headers', {}) or {}
    headers.setdefault('Content-Type', 'application/json')
    if token:
        headers['Authorization'] = f'Bearer {token}'
    r = requests.request(method, f'{BASE}{path}', headers=headers, timeout=30, **kwargs)
    return r


def must(r: requests.Response, label: str, expected: tuple[int, ...] = (200,)) -> dict:
    if r.status_code not in expected:
        raise AssertionError(f'{label}: expected {expected}, got {r.status_code}: {r.text[:500]}')
    if r.text:
        return r.json()
    return {}


def parse_answer(question: str) -> int:
    m = re.search(r'(-?\d+)\s*([+\-−×x*÷/])\s*(-?\d+)\s*=', question)
    if not m:
        raise AssertionError(f'Could not parse challenge question: {question!r}')
    a, op, b = int(m.group(1)), m.group(2), int(m.group(3))
    if op == '+':
        return a + b
    if op in ('-', '−'):
        return a - b
    if op in ('×', 'x', '*'):
        return a * b
    return a // b


def main() -> int:
    evidence: dict = {
        'base_url': BASE,
        'started_at': datetime.now(timezone.utc).isoformat(),
        'checks': {},
    }
    try:
        login = must(req('POST', '/api/auth/login', json={'email': ADMIN_EMAIL, 'password': ADMIN_PASSWORD}), 'admin/player login')
        token = login['token']
        user = must(req('GET', '/api/auth/me', token=token), 'auth me')
        user_id = user['user_id']
        evidence['user'] = {'email': user.get('email'), 'user_id': user_id, 'role': user.get('role')}

        # Avoid a Terms modal covering the checkout UI for this legacy account.
        must(req('POST', '/api/users/me/accept-terms', token=token, json={}), 'accept terms')

        ts = int(time.time())
        payload = {
            'title': f'BUG34 Checkout Play Route {ts}',
            'category': 'prize-draws',
            'price': 1.0,
            'tickets_total': 10,
            'prize_amount': 25.0,
            'end_date': (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
            'image': 'https://images.pexels.com/photos/928187/pexels-photo-928187.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
            'skill_question_type': 'addition',
            'skill_question_difficulty': 'easy',
            'status': 'live',
        }
        created = must(req('POST', '/api/admin/contests', token=token, json=payload), 'create contest')
        contest = created['contest']
        cid = contest['contest_id']
        must(req('PUT', f'/api/admin/contests/{cid}', token=token, json={
            'game_type': 'math_sprint',
            'game_config': {'rounds': 3},
            'entry_mode': 'skill_game',
            'attempts_per_ticket': 3,
            'max_attempts': 3,
            'status': 'live',
            'winner_selection_method': 'leaderboard',
        }), 'update contest game fields')

        contests = must(req('GET', '/api/admin/contests', token=token), 'admin contests list')
        contest = next(c for c in contests if c['contest_id'] == cid)
        evidence['contest'] = {
            'contest_id': cid,
            'slug': contest['slug'],
            'title': contest['title'],
            'game_type': contest.get('game_type'),
            'entry_mode': contest.get('entry_mode'),
            'image': contest.get('image'),
        }

        # Seed enough token balance for both the direct API checkout and the UI checkout.
        wallet_adj = must(req('POST', '/api/admin/wallets/adjust', token=token, json={
            'user_id': user_id,
            'amount': 20,
            'note': 'bug34 checkout route regression seed',
        }), 'admin wallet adjust')
        evidence['wallet_adjust'] = {'ok': wallet_adj.get('ok'), 'balance': wallet_adj.get('balance')}

        challenge = must(req('GET', f'/api/contests/{contest["slug"]}/skill-challenge'), 'skill challenge')
        answer = parse_answer(challenge['question'])
        evidence['challenge'] = {'question': challenge['question'], 'answer_used': answer, 'options': challenge.get('options')}

        checkout = must(req('POST', '/api/orders/checkout', token=token, json={'items': [{
            'contest_id': cid,
            'qty': 1,
            'skill_answer': str(answer),
            'challenge_token': challenge['challenge_token'],
        }]}), 'orders checkout')
        evidence['checkout_response'] = checkout

        required_keys = ['first_ticket_id', 'first_contest_id', 'first_contest_slug', 'first_game_type']
        schema_ok = all(checkout.get(k) for k in required_keys)
        values_ok = (
            checkout.get('first_contest_id') == cid and
            checkout.get('first_contest_slug') == contest['slug'] and
            checkout.get('first_game_type') == 'math_sprint'
        )
        evidence['checks']['checkout_schema'] = {'ok': bool(schema_ok and values_ok), 'required_keys': required_keys}
        if not schema_ok or not values_ok:
            raise AssertionError(f'checkout schema/value check failed: {checkout}')

        tickets = must(req('GET', '/api/orders/my-tickets', token=token), 'my tickets')
        matching = next((t for t in tickets if t.get('ticket_id') == checkout['first_ticket_id']), None)
        if not matching:
            raise AssertionError(f'new ticket not found in my-tickets: {checkout["first_ticket_id"]}')
        c = matching.get('contest') or {}
        ticket_ok = bool(c.get('contest_id') == cid and c.get('image') and c.get('game_type'))
        evidence['my_tickets_entry'] = matching
        evidence['checks']['my_tickets_enrichment'] = {'ok': ticket_ok, 'contest_keys': sorted(c.keys())}
        if not ticket_ok:
            raise AssertionError(f'my-tickets contest enrichment failed: {c}')

        evidence['ui_cart_item'] = {
            'contest_id': cid,
            'slug': contest['slug'],
            'title': contest['title'],
            'price': float(contest['price']),
            'image': contest.get('image'),
            'qty': 1,
            'entry_mode': 'skill_game',
        }
        evidence['completed_at'] = datetime.now(timezone.utc).isoformat()
        evidence['ok'] = True
        OUT.write_text(json.dumps(evidence, indent=2, default=str))
        print(json.dumps(evidence, indent=2, default=str))
        return 0
    except Exception as e:  # noqa: BLE001 - test artifact wants all evidence
        evidence['ok'] = False
        evidence['error'] = str(e)
        evidence['completed_at'] = datetime.now(timezone.utc).isoformat()
        OUT.write_text(json.dumps(evidence, indent=2, default=str))
        print(json.dumps(evidence, indent=2, default=str), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())