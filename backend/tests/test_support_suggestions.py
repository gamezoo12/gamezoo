import json
import asyncio

import pytest

from routers import support_routes
from services import support_suggestions as ss

SCENARIOS = [
    ('free_world', 'Level 6 locked', 'I completed level 5 but level 6 is still locked.', 'locked'),
    ('other', 'Missing prize', 'I won the contest but never received my prize.', 'prize'),
    ('wallet', 'Wallet wrong', 'My wallet balance is incorrect after top up.', 'transaction'),
    ('game', 'Game not loading', 'The game shows a blank screen and will not load.', 'browser'),
    ('leaderboard', 'Ranking', 'My leaderboard ranking is wrong.', 'rank'),
    ('wallet', 'Withdrawal pending', 'My withdrawal has been pending for days.', 'withdrawal'),
]


class _Empty:
    def __getattr__(self, name):
        raise AttributeError(name)


@pytest.mark.parametrize('cat,subject,msg,keyword', SCENARIOS)
def test_each_scenario_is_issue_specific_long_and_signed(cat, subject, msg, keyword):
    case = {'category': cat, 'subject': subject, 'description': msg, 'user_name': 'Sam Jones'}
    out = asyncio.run(ss.generate_suggestions(
        db=_Empty(), case=case, messages=[{'author': 'user', 'body': msg}],
        ai_key='', ai_provider='', ai_model='', redact=support_routes._redact_sensitive,
    ))
    assert out['auto_send'] is False and len(out['suggestions']) == 3
    assert len({s['text'] for s in out['suggestions']}) == 3
    for s in out['suggestions']:
        assert s['word_count'] >= 50, s['text']
        assert s['text'].rstrip().endswith('Prize League Customer Support')
        assert s['text'].startswith(('Hi Sam', 'Hello Sam', 'Dear Sam'))
        assert s['basis'] == 'guidance' and 'rather than a confirmed fix' in s['text']
        assert not ss._UNSAFE_CLAIMS.search(s['text'])


def test_steps_already_tried_are_not_repeated():
    replies = ss.build_template_replies(
        'game_loading', 'Sam', [], 'I already refreshed, cleared cache and tried Chrome', 0)
    for r in replies:
        assert 'clear your browser cache' not in r['text']
        assert 'refresh the page' not in r['text']


def test_ai_output_with_invented_actions_is_rejected():
    bad = '{"suggestions":[{"tone":"friendly","text":"Hi Sam, ' + 'word ' * 60 + 'we have refunded you."}]}'
    assert ss.parse_ai_suggestions(bad, 'Sam') == {}


class _Cursor:
    def __init__(self, rows): self.rows = rows
    def sort(self, *a): return self
    def limit(self, *a): return self
    async def to_list(self, n): return self.rows[:n]


class _Coll:
    def __init__(self, rows): self.rows = rows
    def find(self, *a, **k): return _Cursor(self.rows)
    async def find_one(self, *a, **k): return self.rows[0] if self.rows else None


class _FakeDB:
    def __init__(self, **colls):
        for k, v in colls.items():
            setattr(self, k, _Coll(v))


def _run(db, cat, subject, msg, **kw):
    case = {'user_id': 'u1', 'user_name': 'Sam Jones', 'category': cat, 'subject': subject, 'description': msg}
    return asyncio.run(ss.generate_suggestions(
        db=db, case=case, messages=[{'author': 'user', 'body': msg}],
        ai_key=kw.get('ai_key', ''), ai_provider='openai', ai_model='m',
        redact=support_routes._redact_sensitive,
    ))


def test_verified_withdrawal_status_is_stated_from_records_only():
    db = _FakeDB(withdrawal_requests=[{'status': 'processing', 'amount_pence': 3000}])
    out = _run(db, 'wallet', 'Withdrawal pending', 'My withdrawal is still pending')
    assert out['has_verified_data'] and out['verified_data_used'] == ['Withdrawal requests']
    for s in out['suggestions']:
        assert 'From our records' in s['text'] and '£30.00' in s['text'] and 'awaiting review' in s['text']
        assert s['basis'] == 'verified_data' and s['word_count'] >= 50


def test_free_world_fact_detects_missing_previous_level():
    db = _FakeDB(world_progress=[{'highest_unlocked_level': 3, 'completed_levels': [1]}])
    out = _run(db, 'free_world', 'Locked', 'Level 4 is locked for me')
    assert 'does not list level 3 as completed' in out['suggestions'][0]['text']
    assert 'does not establish why level 4 is locked' in out['suggestions'][0]['text']
    assert 'level 4 unlocks after it' not in out['suggestions'][0]['text']


def test_no_prize_record_is_reported_as_not_found_not_as_lost():
    out = _run(_FakeDB(winners=[]), 'other', 'Prize', 'I won a prize but never received it')
    assert 'cannot find a recorded contest prize' in out['suggestions'][0]['text']


def test_db_failure_degrades_to_guidance():
    class Boom:
        def __getattr__(self, n): raise RuntimeError('db down')
    out = _run(Boom(), 'wallet', 'Wallet', 'My wallet balance is wrong')
    assert not out['has_verified_data'] and out['suggestions'][0]['basis'] == 'guidance'


def test_ai_output_gets_code_injected_facts_and_signature_once():
    raw = ('{"suggestions":[' + ','.join(
        '{"tone":"%s","text":"Hello Sam, thank you for telling us about your withdrawal. This is the %s approach. [[FACTS]]\\nPlease refresh your '
        'winnings page and check the bank details you submitted, then let us know what you see so we can guide you on '
        'the next step. Thank you for your patience.\\n\\nPrize League Customer Support"}' % (t, t)
        for t in ('friendly', 'professional', 'detailed')) + ']}')
    facts = ['your withdrawal of £30.00 is marked as processing (awaiting review)']
    got = ss.parse_ai_suggestions(raw, 'Sam', facts)
    assert set(got) == {'friendly', 'professional', 'detailed'}
    for t in got.values():
        assert t.count('Prize League Customer Support') == 1 and 'From our records' in t and '[[FACTS]]' not in t


def test_ai_guidance_note_precedes_the_friendly_closing():
    text = 'Hello Sam, thank you for reporting the blank game screen. Please try a private window and check your connection. ' * 2
    text += 'Please let us know what happens, and we will guide you on the next step.'
    raw = '{"suggestions":[{"tone":"friendly","text":%s}]}' % json.dumps(text)
    result = ss.parse_ai_suggestions(raw, 'Sam')
    assert 'friendly' in result
    body = result['friendly'].split('\n\nKind regards,')[0]
    assert body.index(ss.GUIDANCE_NOTE) < body.rindex('Please let us know what happens')
    assert body.rstrip().endswith('next step.')


def test_ai_output_stating_account_status_or_actions_is_rejected():
    def one(text):
        return ss.parse_ai_suggestions('{"suggestions":[{"tone":"friendly","text":%s}]}' % json.dumps(text), 'Sam', [])
    filler = ' please refresh the page and tell us the contest name and the date it ended so we can guide you. ' * 3
    assert one('Hello Sam, your balance is 5 tokens.' + filler) == {}
    assert one('Hello Sam, we have reviewed your account.' + filler) == {}
    assert one('Hello Sam, your withdrawal of £99.00 is on its way.' + filler) == {}
    assert one('Hello Sam, this was caused by your internet connection.' + filler) == {}
    assert one('Hello Sam, thanks for getting in touch.' + filler + ' Thanks for your patience.') != {}


def test_ai_output_repeats_no_steps_customer_already_tried():
    text = 'Hello Sam, thanks for the details. Please refresh the page and let us know what happens. ' + 'Please reply with the error shown so we can guide you. ' * 4
    raw = '{"suggestions":[{"tone":"friendly","text":%s}]}' % json.dumps(text)
    assert ss.parse_ai_suggestions(raw, 'Sam', already_tried=['refresh']) == {}


def test_ai_reply_must_retain_the_customer_reported_symptom():
    text = ('Hello Sam, thank you for telling us that the game is not loading. '
            + 'Please try another browser and share what happens so we can guide you. ' * 4
            + 'Thank you for your patience.')
    raw = '{"suggestions":[{"tone":"friendly","text":%s}]}' % json.dumps(text)
    assert ss.parse_ai_suggestions(raw, 'Sam', required_anchor='blank screen') == {}


def test_template_acknowledges_the_reported_blank_screen():
    replies = ss.build_template_replies(
        'game_loading', 'Sam', [], 'The game opens to a blank screen on my iPad.', 0,
    )
    assert all('blank screen' in item['text'].lower() for item in replies)


def test_issue_templates_give_feature_specific_guidance():
    cases = [
        ('free_world', 'Level 6 locked', 'Level 6 is locked', 'Free World'),
        ('other', 'Prize missing', 'I never received my prize', 'contest name'),
        ('wallet', 'Balance wrong', 'My wallet balance is incorrect', 'transaction reference'),
        ('game', 'Loading', 'The game is stuck on a blank screen', 'browser'),
        ('leaderboard', 'Wrong rank', 'My leaderboard ranking is wrong', 'contest name'),
        ('wallet', 'Withdrawal pending', 'My withdrawal is pending', 'date and amount'),
    ]
    for category, subject, message, guidance in cases:
        result = _run(_Empty(), category, subject, message)
        assert result['issue'] == ss.classify_issue(category, f'{subject} {message}')
        assert guidance.casefold() in result['suggestions'][0]['text'].casefold()


def test_user_facing_message_hides_admin_identity():
    from datetime import datetime, timezone
    m = {'author': 'admin', 'author_id': 'user_admin', 'author_name': 'Real Admin', 'body': 'Hi', 'at': datetime.now(timezone.utc)}
    out = support_routes._public_message(m)
    assert out['author_name'] == 'Prize League Customer Support' and 'author_id' not in out
    assert 'Real Admin' not in json.dumps(out, default=str)
