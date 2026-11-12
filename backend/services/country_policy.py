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
    # Legacy accounts without a stored DOB confirmed 18+ at their original signup.
    if not dob:
        return True
    try:
        d = date.fromisoformat(dob)
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

_DIAL = (
    "AF93 AX358 AL355 DZ213 AS1 AD376 AO244 AI1 AQ672 AG1 AR54 AM374 AW297 AU61 AT43 AZ994 BS1 BH973 BD880 BB1 BY375 "
    "BE32 BZ501 BJ229 BM1 BT975 BO591 BQ599 BA387 BW267 BV47 BR55 IO246 BN673 BG359 BF226 BI257 CV238 KH855 CM237 CA1 "
    "KY1 CF236 TD235 CL56 CN86 CX61 CC61 CO57 KM269 CG242 CD243 CK682 CR506 CI225 HR385 CU53 CW599 CY357 CZ420 DK45 "
    "DJ253 DM1 DO1 EC593 EG20 SV503 GQ240 ER291 EE372 SZ268 ET251 FK500 FO298 FJ679 FI358 FR33 GF594 PF689 TF262 GA241 "
    "GM220 GE995 DE49 GH233 GI350 GR30 GL299 GD1 GP590 GU1 GT502 GG44 GN224 GW245 GY592 HT509 HM672 VA39 HN504 HK852 "
    "HU36 IS354 IN91 ID62 IR98 IQ964 IE353 IM44 IL972 IT39 JM1 JP81 JE44 JO962 KZ7 KE254 KI686 KP850 KR82 KW965 KG996 "
    "LA856 LV371 LB961 LS266 LR231 LY218 LI423 LT370 LU352 MO853 MG261 MW265 MY60 MV960 ML223 MT356 MH692 MQ596 MR222 "
    "MU230 YT262 MX52 FM691 MD373 MC377 MN976 ME382 MS1 MA212 MZ258 MM95 NA264 NR674 NP977 NL31 NC687 NZ64 NI505 NE227 "
    "NG234 NU683 NF672 MK389 MP1 NO47 OM968 PK92 PW680 PS970 PA507 PG675 PY595 PE51 PH63 PN64 PL48 PT351 PR1 QA974 "
    "RE262 RO40 RU7 RW250 BL590 SH290 KN1 LC1 MF590 PM508 VC1 WS685 SM378 ST239 SA966 SN221 RS381 SC248 SL232 SG65 "
    "SX1 SK421 SI386 SB677 SO252 ZA27 GS500 SS211 ES34 LK94 SD249 SR597 SJ47 SE46 CH41 SY963 TW886 TJ992 TZ255 TH66 "
    "TL670 TG228 TK690 TO676 TT1 TN216 TR90 TM993 TC1 TV688 UG256 UA380 AE971 GB44 US1 UM1 UY598 UZ998 VU678 VE58 "
    "VN84 VG1 VI1 WF681 EH212 YE967 ZM260 ZW263 XK383"
)
DIAL_CODES = {x[:2]: x[2:] for x in _DIAL.split()}


def phone_matches_country(phone: str, code: str) -> bool:
    dial = DIAL_CODES.get((code or '').upper())
    return bool(dial) and phone.startswith('+' + dial)
