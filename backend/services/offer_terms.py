"""Single source of truth for signup / referral / top-up offer terms.

Every number shown to users or used for eligibility comes from the saved
`reward_settings` document. Terms are snapshotted onto the user or referral
when they become eligible, so later edits never change an earned promise.
Read-only except for the helpers' callers.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

TOPUP_TOKENS_PER_GBP = 1  # Purchased Top-up Tokens per GBP; 1 token = GBP 1 at checkout.
TOPUP_MIN_GBP = 5
TOPUP_MAX_GBP = 1000
TOPUP_PRESETS_GBP = (5, 10, 20, 50, 100)
PREVIEW_AMOUNTS_GBP = (5, 10, 20, 50)


def _num(value) -> float:
    return round(float(value or 0), 2)


def money(value) -> str:
    value = _num(value)
    return f'\u00a3{value:g}' if value == int(value) else f'\u00a3{value:.2f}'


def tokens_text(value) -> str:
    value = _num(value)
    return f'{value:g} token' + ('' if value == 1 else 's')


def _expiry_days(settings: dict, kind: str) -> Optional[int]:
    if settings.get(f'{kind}_bonus_expiry_enabled'):
        return int(settings.get(f'{kind}_bonus_expiry_days') or 0) or None
    return None


def _effective(settings: dict) -> Optional[str]:
    value = settings.get('offer_effective_from')
    return value.isoformat() if isinstance(value, datetime) else value


def signup_terms(settings: dict) -> dict:
    return {
        'kind': 'signup',
        'offer_version': int(settings.get('offer_version') or 1),
        'effective_from': _effective(settings),
        'enabled': bool(settings.get('signup_offer_enabled', True)),
        'qualifying_topup_gbp': _num(settings.get('signup_qualifying_topup_gbp')),
        'reward_tokens': _num(settings.get('signup_reward_tokens')),
        'expiry_days': _expiry_days(settings, 'signup'),
    }


def normal_topup_terms(settings: dict) -> dict:
    return {
        'enabled': bool(settings.get('normal_topup_bonus_enabled', False)),
        'mode': settings.get('normal_topup_bonus_mode') or 'fixed',
        'reward_tokens': _num(settings.get('normal_topup_bonus_tokens')),
        'reward_percent': _num(settings.get('normal_topup_bonus_percent')),
        'minimum_gbp': _num(settings.get('normal_topup_bonus_minimum_gbp')),
        'first_only': bool(settings.get('normal_topup_bonus_first_only', True)),
        'expiry_days': _expiry_days(settings, 'normal_topup'),
        'offer_version': int(settings.get('offer_version') or 1),
        'effective_from': _effective(settings),
    }


def referral_terms(settings: dict) -> dict:
    return {
        'kind': 'referral',
        'offer_version': int(settings.get('offer_version') or 1),
        'effective_from': _effective(settings),
        'enabled': bool(settings.get('referral_offer_enabled', True)),
        'qualifying_topup_gbp': _num(settings.get('referral_qualifying_topup_gbp')),
        'contest_entry_required': bool(settings.get('referral_contest_entry_required', True)),
        'referrer_reward_tokens': _num(settings.get('referral_reward_tokens')),
        'referred_reward_tokens': _num(settings.get('referral_referred_reward_tokens')),
        'expiry_days': _expiry_days(settings, 'referral'),
    }


async def signup_enrollment(db) -> dict:
    """User-document fields for a newly registered account; the terms in force are stored on it."""
    from services.reward_program import get_reward_settings

    settings = await get_reward_settings(db)
    terms = signup_terms(settings)
    base = {'acquisition_type': 'normal', 'promotion_eligibility_status': 'resolved',
            'normal_topup_offer_terms': normal_topup_terms(settings)}
    if not terms['enabled']:
        return {**base, 'signup_bonus_offer_eligible': False}
    return {**base, 'signup_bonus_offer_eligible': True, 'signup_offer_terms': terms,
            'signup_offer_version': terms['offer_version']}


async def referral_enrollment(db) -> dict:
    """Referral-document fields; a referral captured while the offer is off is recorded as rejected."""
    from services.reward_program import get_reward_settings

    terms = referral_terms(await get_reward_settings(db))
    fields = {'offer_version': terms['offer_version'], 'offer_terms': terms}
    if not terms['enabled']:
        fields.update({'status': 'rejected', 'rejected_reason': 'referral_offer_disabled'})
    return fields


def expiry_from_terms(terms: dict, now: Optional[datetime] = None):
    days = terms.get('expiry_days')
    if not days:
        return None
    from services.bonus_grants import compute_expiry
    return compute_expiry(now or datetime.now(timezone.utc), 'days', int(days))


def signup_conditions_text(terms: dict) -> str:
    text = (f"Receive {_num(terms['reward_tokens']):g} Bonus Tokens when you sign up; no top-up is required."
            if _num(terms['qualifying_topup_gbp']) == 0 else
            f"Top up {money(terms['qualifying_topup_gbp'])} or more in one verified payment to receive "
            f"{tokens_text(terms['reward_tokens'])} Bonus Tokens.")
    days = terms.get('expiry_days')
    return text + (f' Bonus Tokens expire {days} days after they are credited.' if days else ' These Bonus Tokens do not expire.')


def referral_conditions_text(terms: dict) -> str:
    steps = [f"signs up with your code, tops up {money(terms['qualifying_topup_gbp'])} or more in one verified payment"]
    if terms.get('contest_entry_required'):
        steps.append('enters at least one contest')
    text = f"You earn {tokens_text(terms['referrer_reward_tokens'])} when your friend " + ' and '.join(steps) + '.'
    if _num(terms.get('referred_reward_tokens')) > 0:
        text += f" Your friend also receives {tokens_text(terms['referred_reward_tokens'])}."
    days = terms.get('expiry_days')
    return text + (f' Reward tokens expire {days} days after they are credited.' if days else '')


def public_offer(settings: dict) -> dict:
    """What the frontend may show; derived only from saved settings."""
    signup, referral = signup_terms(settings), referral_terms(settings)
    return {
        'offer_version': signup['offer_version'],
        'effective_from': signup['effective_from'],
        'topup': {
            'tokens_per_gbp': TOPUP_TOKENS_PER_GBP, 'min_gbp': TOPUP_MIN_GBP, 'max_gbp': TOPUP_MAX_GBP,
            'presets_gbp': list(TOPUP_PRESETS_GBP),
        },
        'signup': {**signup, 'text': signup_conditions_text(signup) if signup['enabled'] else None},
        'normal_topup_promo': normal_topup_terms(settings),
        'referral': {**referral, 'text': referral_conditions_text(referral) if referral['enabled'] else None},
    }


def referral_progress(ref: dict, settings: dict) -> dict:
    """Per-referral state and the exact condition still pending, from the terms that apply to it."""
    terms = ref.get('offer_terms') or referral_terms(settings)
    topup_met = bool(ref.get('topup_qualified'))
    needs_contest = bool(terms.get('contest_entry_required'))
    contest_met = bool(ref.get('contest_entered'))
    conditions = [{
        'key': 'topup', 'met': topup_met, 'required_gbp': terms['qualifying_topup_gbp'],
        'label': f"Top-up of {money(terms['qualifying_topup_gbp'])} or more in one verified payment",
    }]
    if needs_contest:
        conditions.append({'key': 'contest_entry', 'met': contest_met, 'label': 'Enter at least one contest'})
    pending = [c for c in conditions if not c['met']]
    if ref.get('status') == 'rejected':
        state = 'rejected'
    elif ref.get('reward_granted') or ref.get('status') == 'completed':
        state = 'credited'
    elif not pending:
        state = 'qualified'
    else:
        state = 'pending'
    credited = state == 'credited'
    return {
        'reward_state': state,
        'conditions': conditions,
        'pending_conditions': [c['label'] for c in pending],
        'display_status': {
            'credited': 'Rewarded', 'rejected': 'Not eligible', 'qualified': 'Processing reward',
        }.get(state) or f"Waiting for {pending[0]['label'][0].lower()}{pending[0]['label'][1:]}",
        'reward_tokens': _num(ref.get('reward_tokens')) if credited else terms['referrer_reward_tokens'],
        'reward_tx_id': ref.get('reward_tx_id'),
        'offer_version': ref.get('offer_version') or terms.get('offer_version'),
        'rejected_reason': ref.get('rejected_reason'),
    }


def topup_preview(settings: dict, amount_gbp: float) -> dict:
    """Exactly what a new, eligible user's verified top-up produces, split by wallet category."""
    amount = _num(amount_gbp)
    signup, referral, normal_topup = signup_terms(settings), referral_terms(settings), normal_topup_terms(settings)
    purchased = round(amount * TOPUP_TOKENS_PER_GBP, 2)
    valid = TOPUP_MIN_GBP <= amount <= TOPUP_MAX_GBP
    signup_bonus = (signup['reward_tokens'] if valid and signup['enabled'] and signup['qualifying_topup_gbp'] > 0
                    and amount >= signup['qualifying_topup_gbp'] else 0.0)
    normal_topup_bonus = 0.0
    if valid and normal_topup['enabled'] and amount >= normal_topup['minimum_gbp']:
        normal_topup_bonus = (round(purchased * normal_topup['reward_percent'] / 100, 2)
                              if normal_topup['mode'] == 'percentage' else normal_topup['reward_tokens'])
    referral_hit = valid and referral['enabled'] and amount >= referral['qualifying_topup_gbp']
    return {
        'amount_gbp': amount,
        'valid_topup': valid,
        'credited_now': {
            'topup_tokens': purchased if valid else 0.0,
            'bonus_tokens': round(signup_bonus + normal_topup_bonus, 2),
            'winning_tokens': 0.0,
            'winning_bonus_tokens': 0.0,
            'total_tokens': round((purchased if valid else 0.0) + signup_bonus + normal_topup_bonus, 2),
        },
        'signup_bonus': {'qualifies': signup_bonus > 0, 'tokens': signup_bonus, 'expiry_days': signup['expiry_days']},
        'normal_topup_bonus': {'qualifies': normal_topup_bonus > 0, 'tokens': normal_topup_bonus,
                               'expiry_days': normal_topup['expiry_days'], 'terms': normal_topup},
        'referral': {
            'qualifies_topup': bool(referral_hit),
            'referrer_tokens': referral['referrer_reward_tokens'] if referral_hit else 0.0,
            'referred_tokens': referral['referred_reward_tokens'] if referral_hit else 0.0,
            'contest_entry_still_required': bool(referral_hit and referral['contest_entry_required']),
            'note': 'Referral rewards are credited when all conditions are met, not at payment time.',
        },
        'campaign_bonus_if_campaign_code': {
            'tokens': None,
            'note': 'Influencer campaigns are exclusive: with a campaign code only the campaign rewards apply (see the influencer scenario).',
        },
    }


def _iso(value) -> Optional[str]:
    if isinstance(value, datetime):
        return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()
    return value or None


_SIGNUP_WHEN = {
    'email_verified': 'once your email is verified',
    'mobile_verified': 'once your mobile number is verified',
    'first_topup': 'with your first qualifying top-up',
}


def campaign_terms(promo: dict) -> dict:
    """Display-safe influencer campaign terms (no budget, commission or contact fields)."""
    return {
        'kind': 'influencer',
        'promo_id': promo.get('promo_id'),
        'code': promo.get('code'),
        'campaign_name': promo.get('campaign_name') or '',
        'influencer_name': promo.get('influencer_name') or '',
        'signup_reward_tokens': _num(promo.get('signup_reward_tokens')),
        'signup_when': promo.get('registration_eligibility') or 'email_verified',
        'topup_reward_mode': promo.get('topup_reward_mode') or 'fixed',
        'topup_reward_tokens': _num(promo.get('topup_reward_tokens')),
        'topup_reward_percent': round(int(promo.get('topup_reward_bps') or 0) / 100, 2),
        'topup_minimum_gbp': round(int(promo.get('topup_minimum_pence') or 0) / 100, 2),
        'topup_qualification': promo.get('topup_qualification') or 'first_success',
        'topup_first_n': int(promo.get('topup_first_n') or 1),
        'bonus_expiry_days': int(promo['bonus_expiry_days']) if promo.get('bonus_expiry_days') else None,
        'starts_at': _iso(promo.get('starts_at')),
        'expires_at': _iso(promo.get('expires_at')),
    }


def campaign_conditions_text(terms: dict) -> str:
    parts = []
    if terms['signup_reward_tokens'] > 0:
        parts.append(f"{tokens_text(terms['signup_reward_tokens'])} Bonus Tokens {_SIGNUP_WHEN.get(terms['signup_when'], 'at signup')}")
    topup_reward = (terms['topup_reward_tokens'] if terms['topup_reward_mode'] == 'fixed'
                    else terms['topup_reward_percent'])
    if topup_reward > 0:
        amount = (f"{tokens_text(topup_reward)} Bonus Tokens" if terms['topup_reward_mode'] == 'fixed'
                  else f"{topup_reward:g}% of your top-up as Bonus Tokens")
        scope = {'first_success': 'your first qualifying top-up', 'every_success': 'every qualifying top-up',
                 'first_n': f"your first {terms['topup_first_n']} qualifying top-ups"}.get(terms['topup_qualification'], 'a qualifying top-up')
        minimum = f" of {money(terms['topup_minimum_gbp'])} or more" if terms['topup_minimum_gbp'] > 0 else ''
        parts.append(f'{amount} on {scope}{minimum}')
    if not parts:
        return 'Your purchased tokens are credited in full. This campaign adds no bonus tokens.'
    text = 'Campaign offer: ' + '; '.join(parts) + '. Purchased tokens are always credited in full.'
    days = terms.get('bonus_expiry_days')
    return text + (f' Campaign Bonus Tokens expire {days} days after they are credited.' if days else '')


def campaign_topup_preview(promo: dict, amount_gbp: float) -> dict:
    """What a new influencer-attributed user's FIRST qualifying top-up produces, by category.

    Normal signup and top-up promotions are always zero here: campaigns are exclusive.
    Tax is not known in advance, so a tax-excluded campaign may qualify slightly later than shown.
    """
    terms = campaign_terms(promo)
    amount = _num(amount_gbp)
    valid = TOPUP_MIN_GBP <= amount <= TOPUP_MAX_GBP
    purchased = round(amount * TOPUP_TOKENS_PER_GBP, 2) if valid else 0.0
    qualifies = valid and amount >= terms['topup_minimum_gbp']
    topup_bonus = 0.0
    if qualifies:
        topup_bonus = (terms['topup_reward_tokens'] if terms['topup_reward_mode'] == 'fixed'
                       else round(amount * terms['topup_reward_percent'] / 100, 2))
    signup_bonus = terms['signup_reward_tokens']
    return {
        'amount_gbp': amount,
        'valid_topup': valid,
        'topup_qualifies': bool(qualifies),
        'breakdown': {
            'topup_tokens': purchased,
            'influencer_signup_bonus_tokens': signup_bonus,
            'influencer_topup_bonus_tokens': topup_bonus,
            'normal_signup_bonus_tokens': 0.0,
            'normal_topup_bonus_tokens': 0.0,
        },
        'total_tokens': round(purchased + signup_bonus + topup_bonus, 2),
        'signup_bonus_when': terms['signup_when'],
        'bonus_expiry_days': terms['bonus_expiry_days'],
    }


def classify_acquisition(user: dict, attribution: Optional[dict], referral: Optional[dict]) -> str:
    """Read-only classification for reporting; the reward path uses resolve_acquisition_program."""
    if attribution:
        return 'influencer'
    kind = user.get('acquisition_type')
    if kind == 'staff':
        return 'staff'
    if kind == 'normal' and user.get('promotion_eligibility_status') in (None, 'resolved'):
        return 'normal'
    if kind in ('influencer_pending', 'unresolved') or user.get('promotion_eligibility_status') == 'pending':
        return 'unresolved'
    if referral or user.get('referred_by') or user.get('signup_bonus_offer_eligible') is True:
        return 'normal'
    return 'unresolved'


# What the published Terms & Conditions (section 20) and Privacy Policy say today.
PUBLISHED_TERMS = {
    'reward': 'one free competition entry ticket for both users (T&C 20.4); privacy policy mentions free competition entry tickets',
    'entry': 'a qualifying paid competition must be entered (T&C 20.3)',
    'topup': 'no minimum top-up is stated (T&C 20.3)',
}


def legal_flags(settings: dict) -> list:
    """Discrepancies between configured rewards and published wording. For approval; nothing is edited."""
    referral, signup = referral_terms(settings), signup_terms(settings)
    normal_topup = normal_topup_terms(settings)
    flags = []
    if referral['enabled'] and (referral['referrer_reward_tokens'] > 0 or referral['referred_reward_tokens'] > 0):
        flags.append({'severity': 'high', 'area': 'Referral reward type',
                      'published': PUBLISHED_TERMS['reward'],
                      'configured': f"{tokens_text(referral['referrer_reward_tokens'])} Bonus Tokens to the referrer"
                                    + (f" and {tokens_text(referral['referred_reward_tokens'])} to the referred user"
                                       if referral['referred_reward_tokens'] > 0 else ' only'),
                      'action': 'Update Terms 20.4 and the privacy wording, or change the reward, before publication.'})
    if referral['enabled'] and not referral['contest_entry_required']:
        flags.append({'severity': 'medium', 'area': 'Contest entry requirement',
                      'published': PUBLISHED_TERMS['entry'], 'configured': 'No contest entry is required',
                      'action': 'Terms 20.3 requires a qualifying paid competition; reconcile before publication.'})
    if referral['enabled'] or signup['enabled']:
        flags.append({'severity': 'medium', 'area': 'Minimum top-up and expiry not published',
                      'published': PUBLISHED_TERMS['topup'],
                      'configured': f"Referral min {money(referral['qualifying_topup_gbp'])}; signup min "
                                    f"{money(signup['qualifying_topup_gbp'])}; expiry "
                                    f"{signup['expiry_days'] or 'none'}/{referral['expiry_days'] or 'none'} days",
                      'action': 'Add the minimum top-up and any bonus expiry to the published terms.'})
    if normal_topup['enabled'] and (normal_topup['reward_tokens'] > 0 or normal_topup['reward_percent'] > 0):
        configured_reward = (f"{normal_topup['reward_percent']:g}% of purchased Top-up Tokens"
                             if normal_topup['mode'] == 'percentage'
                             else f"{tokens_text(normal_topup['reward_tokens'])} Bonus Tokens")
        flags.append({'severity': 'high', 'area': 'Normal top-up bonus',
                      'published': 'No normal top-up promotional token reward is stated in the published terms.',
                      'configured': f"{configured_reward} on qualifying top-ups of {money(normal_topup['minimum_gbp'])} or more",
                      'action': 'Update and approve the published terms before enabling or advertising this promotion.'})
    return flags
