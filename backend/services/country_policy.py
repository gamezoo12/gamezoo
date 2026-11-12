"""Centralised country-of-residence access policy (single source of truth)."""
import time
from datetime import date, datetime, timezone

from fastapi import HTTPException

_RAW = (
    "AF:Afghanistan|AX:Åland Islands|AL:Albania|DZ:Algeria|AS:American Samoa|AD:Andorra|AO:Angola|AI:Anguilla|AQ:Antarctica|"
    "AG:Antigua and Barbuda|AR:Argentina|AM:Armenia|AW:Aruba|AU:Australia|AT:Austria|AZ:Azerbaijan|BS:Bahamas|BH:Bahrain|"
    "BD:Bangladesh|BB:Barbados|BY:Belarus|BE:Belgium|BZ:Belize|BJ:Benin|BM:Bermuda|BT:Bhutan|BO:Bolivia|BQ:Caribbean Netherlands|"
    "BA:Bosnia and Herzegovina|BW:Botswana|BV:Bouvet Island|BR:Brazil|IO:British Indian Ocean Territory|BN:Brunei|BG:Bulgaria|"
    "BF:Burkina Faso|BI:Burundi|CV:Cape Verde|KH:Cambodia|CM:Cameroon|CA:Canada|KY:Cayman Islands|CF:Central African Republic|"
    "TD:Chad|CL:Chile|CN:China|CX:Christmas Island|CC:Cocos (Keeling) Islands|CO:Colombia|KM:Comoros|CG:Congo|"
    "CD:Congo (DRC)|CK:Cook Islands|CR:Costa Rica|CI:Côte d'Ivoire|HR:Croatia|CU:Cuba|CW:Curaçao|CY:Cyprus|CZ:Czechia|"
    "DK:Denmark|DJ:Djibouti|DM:Dominica|DO:Dominican Republic|EC:Ecuador|EG:Egypt|SV:El Salvador|GQ:Equatorial Guinea|"
    "ER:Eritrea|EE:Estonia|SZ:Eswatini|ET:Ethiopia|FK:Falkland Islands|FO:Faroe Islands|FJ:Fiji|FI:Finland|FR:France|"
    "GF:French Guiana|PF:French Polynesia|TF:French Southern Territories|GA:Gabon|GM:Gambia|GE:Georgia|DE:Germany|GH:Ghana|"
    "GI:Gibraltar|GR:Greece|GL:Greenland|GD:Grenada|GP:Guadeloupe|GU:Guam|GT:Guatemala|GG:Guernsey|GN:Guinea|GW:Guinea-Bissau|"
    "GY:Guyana|HT:Haiti|HM:Heard and McDonald Islands|VA:Vatican City|HN:Honduras|HK:Hong Kong|HU:Hungary|IS:Iceland|IN:India|"
    "ID:Indonesia|IR:Iran|IQ:Iraq|IE:Ireland|IM:Isle of Man|IL:Israel|IT:Italy|JM:Jamaica|JP:Japan|JE:Jersey|JO:Jordan|"
    "KZ:Kazakhstan|KE:Kenya|KI:Kiribati|KP:North Korea|KR:South Korea|KW:Kuwait|KG:Kyrgyzstan|LA:Laos|LV:Latvia|LB:Lebanon|"
    "LS:Lesotho|LR:Liberia|LY:Libya|LI:Liechtenstein|LT:Lithuania|LU:Luxembourg|MO:Macao|MG:Madagascar|MW:Malawi|MY:Malaysia|"
    "MV:Maldives|ML:Mali|MT:Malta|MH:Marshall Islands|MQ:Martinique|MR:Mauritania|MU:Mauritius|YT:Mayotte|MX:Mexico|"
    "FM:Micronesia|MD:Moldova|MC:Monaco|MN:Mongolia|ME:Montenegro|MS:Montserrat|MA:Morocco|MZ:Mozambique|MM:Myanmar|"
    "NA:Namibia|NR:Nauru|NP:Nepal|NL:Netherlands|NC:New Caledonia|NZ:New Zealand|NI:Nicaragua|NE:Niger|NG:Nigeria|NU:Niue|"
    "NF:Norfolk Island|MK:North Macedonia|MP:Northern Mariana Islands|NO:Norway|OM:Oman|PK:Pakistan|PW:Palau|PS:Palestine|"
    "PA:Panama|PG:Papua New Guinea|PY:Paraguay|PE:Peru|PH:Philippines|PN:Pitcairn Islands|PL:Poland|PT:Portugal|PR:Puerto Rico|"
    "QA:Qatar|RE:Réunion|RO:Romania|RU:Russia|RW:Rwanda|BL:Saint Barthélemy|SH:Saint Helena|KN:Saint Kitts and Nevis|"
    "LC:Saint Lucia|MF:Saint Martin|PM:Saint Pierre and Miquelon|VC:Saint Vincent and the Grenadines|WS:Samoa|SM:San Marino|"
    "ST:São Tomé and Príncipe|SA:Saudi Arabia|SN:Senegal|RS:Serbia|SC:Seychelles|SL:Sierra Leone|SG:Singapore|SX:Sint Maarten|"
    "SK:Slovakia|SI:Slovenia|SB:Solomon Islands|SO:Somalia|ZA:South Africa|GS:South Georgia|SS:South Sudan|ES:Spain|"
    "LK:Sri Lanka|SD:Sudan|SR:Suriname|SJ:Svalbard and Jan Mayen|SE:Sweden|CH:Switzerland|SY:Syria|TW:Taiwan|TJ:Tajikistan|"
    "TZ:Tanzania|TH:Thailand|TL:Timor-Leste|TG:Togo|TK:Tokelau|TO:Tonga|TT:Trinidad and Tobago|TN:Tunisia|TR:Türkiye|"
    "TM:Turkmenistan|TC:Turks and Caicos Islands|TV:Tuvalu|UG:Uganda|UA:Ukraine|AE:United Arab Emirates|GB:United Kingdom|"
    "US:United States|UM:U.S. Outlying Islands|UY:Uruguay|UZ:Uzbekistan|VU:Vanuatu|VE:Venezuela|VN:Vietnam|"
    "VG:British Virgin Islands|VI:U.S. Virgin Islands|WF:Wallis and Futuna|EH:Western Sahara|YE:Yemen|ZM:Zambia|ZW:Zimbabwe|"
    "XK:Kosovo"
)
COUNTRIES = dict(p.split(':', 1) for p in _RAW.split('|'))
UK = 'GB'

PERMISSIONS = [
    ('allow_registration', 'Registration'), ('allow_login', 'Login'), ('allow_browsing', 'Website browsing'),
    ('allow_free_games', 'Free World non-prize games'), ('allow_leaderboards', 'Leaderboard viewing'),
    ('allow_paid_browsing', 'Paid World browsing'), ('allow_paid_contests', 'Paid contest participation'),
    ('allow_free_world_prizes', 'Free World prize participation'), ('allow_promo_draws', 'Promotional draw participation'),
    ('allow_wallet_topups', 'Wallet top-ups'), ('allow_prize_claims', 'Prize claims / withdrawals'),
    ('require_email_otp', 'Require email OTP'), ('require_phone_otp', 'Require phone OTP'),
]
PERM_KEYS = [k for k, _ in PERMISSIONS]
PRIZE_PERMS = {'allow_paid_contests', 'allow_free_world_prizes', 'allow_promo_draws', 'allow_wallet_topups', 'allow_prize_claims'}
OTP_KEYS = ['sms_daily_limit', 'sms_alert_at']

UK_DEFAULT = {k: True for k in PERM_KEYS} | {'sms_daily_limit': 2000, 'sms_alert_at': 1500}
INTL_DEFAULT = {k: True for k in PERM_KEYS} | {k: False for k in PRIZE_PERMS} | {
    'require_phone_otp': False, 'sms_daily_limit': 0, 'sms_alert_at': 0}

INTERNATIONAL_NOTICE = ('Prize competitions are currently available only to eligible UK residents aged 18 or over. '
                        'You can still explore Prize League and enjoy available non-prize games.')
_STAFF = {'admin', 'super_admin', 'operator', 'support'}
_cache: dict = {'at': 0.0, 'default': None, 'rows': {}}


def invalidate_cache() -> None:
    _cache['at'] = 0.0


async def _load(db) -> None:
    if time.monotonic() - _cache['at'] < 15:
        return
    d = await db.country_policy_settings.find_one({'_id': 'default'}, {'_id': 0}) or {}
    _cache['default'] = {**INTL_DEFAULT, **{k: d[k] for k in (*PERM_KEYS, *OTP_KEYS) if k in d}}
    _cache['rows'] = {r['code']: r async for r in db.country_policies.find({}, {'_id': 0})}
    _cache['at'] = time.monotonic()


async def get_policy(db, code: str | None) -> dict:
    await _load(db)
    code = (code or '').upper()
    base = UK_DEFAULT if code == UK else _cache['default']
    row = _cache['rows'].get(code) or {}
    return {**base, **{k: row[k] for k in (*PERM_KEYS, *OTP_KEYS) if k in row}}


def _age_ok(dob: str | None) -> bool:
    try:
        d = date.fromisoformat(dob or '')
    except ValueError:
        return False
    t = date.today()
    return t.year - d.year - ((t.month, t.day) < (d.month, d.day)) >= 18


def verified_resident(user: dict) -> bool:
    """Residence is self-declared + verified mobile; UK additionally needs a verified +44 number."""
    code = user.get('country_of_residence')
    if not code or not user.get('phone_verified') or not _age_ok(user.get('dob')):
        return False
    return code != UK or str(user.get('phone') or '').startswith('+44')


async def user_access(db, user: dict | None) -> dict:
    if not user:
        return {}
    code = user.get('country_of_residence')
    policy = await get_policy(db, code)
    staff = user.get('role') in _STAFF
    access = {k: bool(policy[k]) for k in PERM_KEYS}
    if not staff:
        eligible = bool(code) and verified_resident(user)
        for k in PRIZE_PERMS:
            access[k] = access[k] and eligible
    reason = None
    if not code and not staff:
        reason = 'COUNTRY_REQUIRED'
    elif any(not access[k] for k in PRIZE_PERMS):
        reason = 'COUNTRY_RESTRICTED'
    return {'country': code, 'country_name': COUNTRIES.get(code or ''), 'permissions': access,
            'restriction_code': reason, 'notice': INTERNATIONAL_NOTICE if reason else None}


async def require_country_permission(db, user: dict, perm: str) -> None:
    access = await user_access(db, user)
    if access['permissions'].get(perm):
        return
    if not user.get('country_of_residence') and user.get('role') not in _STAFF:
        raise HTTPException(status_code=403, detail={'code': 'COUNTRY_REQUIRED',
                            'message': 'Please confirm your country of residence to use prize features.'})
    raise HTTPException(status_code=403, detail={'code': 'COUNTRY_RESTRICTED', 'message': INTERNATIONAL_NOTICE})


async def record_audit(db, admin: dict, action: str, codes: list, before: dict, after: dict) -> None:
    await db.country_policy_audit.insert_one({
        'at': datetime.now(timezone.utc), 'admin_id': admin.get('user_id'), 'admin_email': admin.get('email'),
        'action': action, 'codes': codes[:300], 'before': before, 'after': after})
