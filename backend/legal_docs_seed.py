"""
Prize League — Legal document registry (25 policies).
Each entry seeds a first-draft document. All non-uploaded drafts are marked
`ai_generated=True` and prefixed with a compliance banner requiring
solicitor review before publication.

The four docs the client uploaded verbatim (Terms, Privacy, Website AUP,
Mobile Terms) have `ai_generated=False` — they were authored by the client.
"""
from __future__ import annotations

COMPANY_BLOCK = """
**Company:** PRIZE LEAGUE LTD  
**Company Number:** 17338919 (England and Wales)  
**Registered Office:** 118 Windsor Road, London, England, E7 0RB, United Kingdom  
**Website:** https://www.prizeleague.co.uk  
**General:** info@prizeleague.co.uk  
**Support:** support@prizeleague.co.uk
"""

REVIEW_BANNER = (
    "> ⚠️ **AI-DRAFTED PLACEHOLDER — Requires review and approval by a qualified "
    "UK solicitor/compliance adviser before publication.**\n\n"
)


def _draft(intro: str, sections: list[tuple[str, str]]) -> str:
    md = REVIEW_BANNER + COMPANY_BLOCK + "\n\n" + intro + "\n\n"
    for title, body in sections:
        md += f"## {title}\n\n{body}\n\n"
    md += (
        "\n---\n\n"
        "*This document is a working draft. It has not been reviewed by legal "
        "counsel. Prize League Ltd will publish the final version once "
        "compliance review is complete.*\n"
    )
    return md


LEGAL_DOCS = [
    # ---------- 1. Terms & Conditions (client-provided) ----------
    {
        'slug': 'terms',
        'title': 'Terms and Conditions',
        'owner': 'Legal & Compliance',
        'ai_generated': False,
        'source_url': 'https://customer-assets.emergentagent.com/job_contest-arena-16/artifacts/5f32ng5s_Prize%20League%20-%20Terms%20%26%20Conditions.docx',
        'content': (
            COMPANY_BLOCK
            + "\n\nThese Terms & Conditions govern your use of the Prize League "
              "website, platform, competitions and related services. The full "
              "client-approved text has been imported from the uploaded Word "
              "document — open in the editor to review and adjust before "
              "publication."
        ),
    },
    # ---------- 2. Privacy Policy (client-provided) ----------
    {
        'slug': 'privacy',
        'title': 'Privacy Policy',
        'owner': 'Data Protection Officer',
        'ai_generated': False,
        'source_url': 'https://customer-assets.emergentagent.com/job_contest-arena-16/artifacts/vzlwob1h_Prize%20League%20-%20Privacy%20Policy.docx',
        'content': (
            COMPANY_BLOCK
            + "\n\nHow Prize League Ltd collects, uses, stores and protects your "
              "personal information under the UK GDPR and Data Protection Act "
              "2018. Full text imported from the uploaded Word document."
        ),
    },
    # ---------- 3. Website Terms of Use & AUP (client-provided) ----------
    {
        'slug': 'website-terms',
        'title': 'Website Terms of Use & Acceptable Use Policy',
        'owner': 'Legal & Compliance',
        'ai_generated': False,
        'source_url': 'https://customer-assets.emergentagent.com/job_contest-arena-16/artifacts/66w4ugan_Prize%20League%20-%20Website%20Terms%20of%20Use%20%26%20Acceptable%20Use%20Policy.docx',
        'content': (
            COMPANY_BLOCK
            + "\n\nRules governing your use of the Prize League website. "
              "Full text imported from the uploaded Word document."
        ),
    },
    # ---------- 4. Mobile Terms of Service (client-provided) ----------
    {
        'slug': 'mobile-terms',
        'title': 'Mobile Terms of Service',
        'owner': 'Legal & Compliance',
        'ai_generated': False,
        'source_url': 'https://customer-assets.emergentagent.com/job_contest-arena-16/artifacts/awgmhp1h_Prize%20League%20-%20Mobile%20Terms%20of%20Service.docx',
        'content': (
            COMPANY_BLOCK
            + "\n\nAdditional terms applicable when accessing Prize League on "
              "a mobile device or mobile browser. Full text imported from the "
              "uploaded Word document."
        ),
    },
    # ---------- 5. Cookie Policy ----------
    {
        'slug': 'cookies',
        'title': 'Cookie Policy',
        'owner': 'Data Protection Officer',
        'ai_generated': True,
        'content': _draft(
            "This Cookie Policy explains what cookies and similar technologies "
            "are used on prizeleague.co.uk, why they are used, and how you can "
            "manage your preferences.",
            [
                ('1. What are cookies',
                 'Cookies are small text files placed on your device when you visit a website. '
                 'They allow the website to recognise your device and remember information about your visit.'),
                ('2. Categories of cookies used',
                 '**Strictly necessary** — session, authentication, security.  \n'
                 '**Performance** — anonymous usage analytics via PostHog.  \n'
                 '**Functionality** — remembering language, layout, wallet balance display.  \n'
                 '**Marketing** — only if you opt in through the consent banner.'),
                ('3. Managing your preferences',
                 'You can accept, reject or customise cookies through the consent banner '
                 'displayed on your first visit and via Preferences → Privacy in your account.'),
                ('4. Third-party cookies',
                 'Payment (Stripe), analytics (PostHog), captcha (Cloudflare Turnstile) '
                 'and social embeds may set their own cookies subject to their own policies.'),
                ('5. Retention',
                 'Session cookies expire when you close your browser. Persistent cookies '
                 'expire between 30 days and 24 months depending on purpose.'),
                ('6. Contact',
                 'Questions: support@prizeleague.co.uk'),
            ],
        ),
    },
    # ---------- 6. Competition Terms ----------
    {
        'slug': 'competition-terms',
        'title': 'Competition Terms',
        'owner': 'Competition Operations',
        'ai_generated': True,
        'content': _draft(
            "These Competition Terms apply to every skill competition, prize "
            "draw and instant-result competition operated by Prize League Ltd.",
            [
                ('1. Nature of competitions',
                 'All competitions are skill-based. Participants must successfully complete a '
                 'skill task or challenge to become eligible to win.'),
                ('2. Entry',
                 'Entry may be made by (a) purchasing an entry ticket through the platform '
                 'or (b) submitting a free postal entry where the specific competition supports it.'),
                ('3. Age & eligibility',
                 'Open to UK residents aged 18 or over unless a specific competition states otherwise.'),
                ('4. Winner selection',
                 'Method is disclosed on each competition page: leaderboard performance, '
                 'random draw from eligible pool, or predetermined instant-win ticket allocation.'),
                ('5. Prizes',
                 'Prize details are displayed on each competition page. Prizes are non-transferable '
                 'unless expressly agreed by Prize League Ltd. Cash prizes are paid to the verified '
                 'winner\'s UK bank account after identity verification.'),
                ('6. Verification',
                 'Winners may be required to complete identity, age and address verification '
                 'before the prize is released.'),
                ('7. Disqualification',
                 'Prize League may cancel entries or disqualify participants for fraud, misuse of '
                 'the platform, multiple accounts, bots or breach of these terms.'),
                ('8. Cancellation',
                 'Prize League reserves the right to cancel a competition where required by law '
                 'or force majeure and will provide a fair refund route where appropriate.'),
                ('9. Complaints',
                 'Concerns about a specific competition should be raised via support@prizeleague.co.uk '
                 'within 30 days of the closing date.'),
            ],
        ),
    },
    # ---------- 7. Individual Contest Rules (template) ----------
    {
        'slug': 'contest-rules',
        'title': 'Individual Contest Rules (Template)',
        'owner': 'Competition Operations',
        'ai_generated': True,
        'content': _draft(
            "Each individual competition has its own rule page created by an "
            "administrator. Those page-specific rules take precedence over "
            "this general template where they conflict.",
            [
                ('Required fields per contest',
                 '- Contest title, short & full description  \n'
                 '- How to enter (paid + free postal)  \n'
                 '- Skill task / game instructions  \n'
                 '- Ticket price & maximum tickets per user  \n'
                 '- Opening date/time, closing date/time, result date  \n'
                 '- Prize details, number of prizes, prize values  \n'
                 '- Winner determination method (leaderboard / random / instant)  \n'
                 '- Scoring & tie-break methodology  \n'
                 '- Refund position  \n'
                 '- Country & age restrictions'),
                ('Admin controls',
                 'The contest configuration is locked once the contest opens for entries. '
                 'Any post-open change requires a Super Admin override and is recorded in the audit log.'),
            ],
        ),
    },
    # ---------- 8. Free Postal Entry Policy ----------
    {
        'slug': 'postal-entry',
        'title': 'Free Postal Entry Policy',
        'owner': 'Competition Operations',
        'ai_generated': True,
        'content': _draft(
            "Prize League provides a free postal entry route for eligible "
            "competitions, ensuring an alternative method of entry without "
            "purchase where the competition supports it.",
            [
                ('1. Postal address',
                 'Free Postal Entry  \nPRIZE LEAGUE LTD  \n118 Windsor Road  \nLondon, England, E7 0RB  \nUnited Kingdom'),
                ('2. Required information on your envelope contents',
                 '- Full name  \n- Prize League account username or registered email  \n'
                 '- Confirmation you are aged 18+  \n- Confirmation you agree to the Terms & Conditions  \n'
                 '- The exact name of the competition  \n- Your answer to the skill task'),
                ('3. Eligibility',
                 'The postal route is available only for competitions where "Free Postal Entry Available" '
                 'is enabled by the administrator. Leaderboard competitions may not accept postal entries '
                 'where the winning result depends on live gameplay performance.'),
                ('4. Processing statuses',
                 'Received → Under Review → Validated / Rejected / Duplicate / Late Entry → Allocated.'),
                ('5. Reasons a postal entry may be rejected',
                 'Missing information; late arrival; failed skill answer; ineligible entrant; entry cap reached; breach of terms.'),
                ('6. Auditability',
                 'Every postal decision records reviewer, timestamp, reason and prior status.'),
            ],
        ),
    },
    # ---------- 9. Refund & Cancellation ----------
    {
        'slug': 'refunds',
        'title': 'Refund and Cancellation Policy',
        'owner': 'Payments & Compliance',
        'ai_generated': True,
        'content': _draft(
            "This policy explains when refunds may be issued on Prize League "
            "entry tickets and wallet balances.",
            [
                ('1. Entry tickets',
                 'By law and by nature, prize competitions have limited cancellation rights once the '
                 'skill task or draw has begun. Refund requests must be submitted before the competition '
                 'closing time to be considered.'),
                ('2. Wallet top-ups',
                 'Unused wallet balance may be refunded to the original payment method subject to '
                 'identity verification and anti-fraud checks. Bonus/promotional credits are not refundable.'),
                ('3. Cancelled competitions',
                 'If Prize League cancels a competition before it closes, all valid paid entrants receive '
                 'either a full refund to their wallet or original payment method.'),
                ('4. How to request',
                 'Email support@prizeleague.co.uk with your Prize League public ID, competition name '
                 'and the reason for the request.'),
                ('5. Processing time',
                 'Approved refunds are issued within 5-10 UK business days.'),
            ],
        ),
    },
    # ---------- 10. Complaints Handling ----------
    {
        'slug': 'complaints',
        'title': 'Complaints Handling Policy',
        'owner': 'Customer Care',
        'ai_generated': True,
        'content': _draft(
            "Prize League Ltd takes every complaint seriously and follows a "
            "documented resolution workflow.",
            [
                ('1. How to raise a complaint',
                 'Email support@prizeleague.co.uk or submit a ticket via the Support Centre inside your account.'),
                ('2. Acknowledgement',
                 'Every complaint is acknowledged within 2 UK business days with a unique reference number.'),
                ('3. Investigation',
                 'A complaints officer investigates within 15 UK business days. Complex cases may take longer; we will keep you informed.'),
                ('4. Outcome',
                 'You will receive a written outcome including any corrective action, refund or escalation path.'),
                ('5. Escalation',
                 'If unsatisfied, you may escalate to a Complaints Manager for a final internal review.'),
                ('6. External routes',
                 'Where applicable, you may contact Trading Standards, the ICO (data), or the appropriate ADR scheme following completion of our internal process.'),
            ],
        ),
    },
    # ---------- 11. Acceptable Use (site + platform) ----------
    {
        'slug': 'acceptable-use',
        'title': 'Acceptable Use Policy',
        'owner': 'Trust & Safety',
        'ai_generated': True,
        'content': _draft(
            "Rules for acceptable behaviour on the Prize League platform.",
            [
                ('1. Prohibited conduct',
                 'No fraud, no cheating, no bots, no multiple accounts, no attempts to exploit scoring, '
                 'no abusive conduct toward staff or other users, no unlawful content.'),
                ('2. Security',
                 'No probing, scanning or testing the platform for vulnerabilities without written authorisation.'),
                ('3. Consequences',
                 'Breach may result in account suspension, competition entry cancellation, prize forfeiture '
                 'and referral to law enforcement where warranted.'),
                ('4. Reporting',
                 'Report suspected abuse to support@prizeleague.co.uk.'),
            ],
        ),
    },
    # ---------- 12. Responsible Participation ----------
    {
        'slug': 'responsible',
        'title': 'Responsible Participation Policy',
        'owner': 'Player Protection',
        'ai_generated': True,
        'content': _draft(
            "Prize League operates skill competitions responsibly and supports "
            "players in maintaining healthy engagement.",
            [
                ('1. Age',
                 'Only individuals 18 or over may create an account or enter competitions.'),
                ('2. Self-controls',
                 'You may set deposit limits, time-out periods or self-exclude via Preferences → Play Limits.'),
                ('3. Awareness',
                 'Skill competitions are for entertainment. Spend only what you can afford. If your participation '
                 'is affecting your finances or wellbeing please reach out to independent support (e.g. Citizens Advice, GamCare).'),
                ('4. Vulnerable customers',
                 'We follow a documented Vulnerable Customer Policy — contact support if you would like additional protections applied.'),
            ],
        ),
    },
    # ---------- 13. AML ----------
    {
        'slug': 'aml',
        'title': 'Anti-Money Laundering Policy',
        'owner': 'MLRO',
        'ai_generated': True,
        'content': _draft(
            "Prize League is committed to preventing money laundering and "
            "terrorist financing through its services.",
            [
                ('1. Risk-based approach',
                 'We apply a documented AML risk assessment covering customer, product, geographic and delivery-channel factors.'),
                ('2. KYC',
                 'Customer due diligence is performed at registration and enhanced due diligence for higher-risk cases or larger prize payouts.'),
                ('3. Ongoing monitoring',
                 'Transaction patterns are monitored for unusual behaviour. Automated flags trigger a human review.'),
                ('4. Reporting',
                 'Suspicious activity is escalated to our MLRO and, where required, reported to the National Crime Agency (NCA).'),
                ('5. Record-keeping',
                 'AML records are retained for at least 5 years from the end of the customer relationship.'),
            ],
        ),
    },
    # ---------- 14. CTF ----------
    {
        'slug': 'ctf',
        'title': 'Counter-Terrorist Financing Policy',
        'owner': 'MLRO',
        'ai_generated': True,
        'content': _draft(
            "Prize League screens for and prevents its services being used to "
            "finance terrorism.",
            [
                ('1. Sanctions & PEP screening',
                 'Customers and payments are screened against the UK Sanctions List and PEP data at onboarding and on an ongoing basis.'),
                ('2. Escalation',
                 'Matches or hits are escalated to the MLRO for review. Confirmed matches are frozen and reported to HMT/OFSI as required.'),
                ('3. Prohibited jurisdictions',
                 'Prize League does not accept customers from jurisdictions subject to UK financial sanctions.'),
            ],
        ),
    },
    # ---------- 15. Anti-Fraud ----------
    {
        'slug': 'anti-fraud',
        'title': 'Anti-Fraud Policy',
        'owner': 'Fraud Operations',
        'ai_generated': True,
        'content': _draft(
            "Zero tolerance for fraudulent activity on the Prize League "
            "platform.",
            [
                ('1. Detection',
                 'Automated rules and manual review detect payment fraud, chargebacks, multi-accounting, '
                 'device manipulation, score manipulation, VPN abuse and bonus abuse.'),
                ('2. Response',
                 'Confirmed fraud results in account closure, prize forfeiture, refund reversal and referral to law enforcement.'),
                ('3. Fair review',
                 'All fraud decisions include reviewer identity, evidence, reason and audit trail. Users may appeal.'),
            ],
        ),
    },
    # ---------- 16. KYC / Identity Verification ----------
    {
        'slug': 'kyc',
        'title': 'Identity Verification and KYC Policy',
        'owner': 'Compliance',
        'ai_generated': True,
        'content': _draft(
            "How Prize League verifies the identity of its users.",
            [
                ('1. When we verify',
                 'At registration (soft checks), when prize value exceeds threshold, for withdrawals, and where risk indicators trigger enhanced due diligence.'),
                ('2. What we collect',
                 'Government ID, proof of address, date of birth, telephone number. Documents are stored securely and retained per our Data Retention Policy.'),
                ('3. Rejection & appeal',
                 'Users may re-submit rejected KYC with clearer documentation. Appeals go to the Compliance team.'),
            ],
        ),
    },
    # ---------- 17. Sanctions Screening ----------
    {
        'slug': 'sanctions',
        'title': 'Sanctions Screening Policy',
        'owner': 'MLRO',
        'ai_generated': True,
        'content': _draft(
            "Prize League screens customers, payments and beneficial owners "
            "against applicable sanctions lists.",
            [
                ('1. Lists screened',
                 'UK OFSI Consolidated List, EU CFSP, UN, OFAC-blocked persons where applicable to UK.'),
                ('2. Frequency',
                 'At registration, on payment events and on a daily batch basis. Records retained for audit.'),
            ],
        ),
    },
    # ---------- 18. SAR ----------
    {
        'slug': 'sar',
        'title': 'Suspicious Activity Escalation Procedure',
        'owner': 'MLRO',
        'ai_generated': True,
        'content': _draft(
            "Internal escalation procedure for staff who identify suspicious "
            "activity.",
            [
                ('1. Reporter',
                 'Any staff member may raise an internal SAR (iSAR) via the compliance portal. Anonymity is preserved.'),
                ('2. Review',
                 'The MLRO reviews iSARs within 24 hours and determines whether an external SAR to the NCA is required.'),
                ('3. Tipping-off',
                 'Staff must not disclose the existence of a SAR to the subject or any third party.'),
            ],
        ),
    },
    # ---------- 19. Payment & Wallet Terms ----------
    {
        'slug': 'payment-wallet',
        'title': 'Payment and Wallet Terms',
        'owner': 'Payments',
        'ai_generated': True,
        'content': _draft(
            "Terms governing deposits, wallet balances and payments on the "
            "Prize League platform.",
            [
                ('1. Deposits',
                 'Processed via Stripe. Only debit/credit cards registered to the account holder or approved payment methods are permitted.'),
                ('2. Wallet',
                 'Prize League wallet balances may be used only for entering competitions or refunded to the original payment method subject to checks.'),
                ('3. Currency',
                 'All balances and prices are in GBP (£).'),
                ('4. Chargebacks',
                 'A chargeback triggers immediate account suspension pending investigation. Confirmed chargebacks may result in account closure.'),
            ],
        ),
    },
    # ---------- 20. Prize Payment & Withdrawal ----------
    {
        'slug': 'withdrawals',
        'title': 'Prize Payment and Withdrawal Policy',
        'owner': 'Payments',
        'ai_generated': True,
        'content': _draft(
            "How and when Prize League pays out winnings and how users can "
            "withdraw eligible balances.",
            [
                ('1. Verified bank only',
                 'Prize payments are made to the verified UK bank account belonging to the winner. No third-party payouts.'),
                ('2. Verification threshold',
                 'For prizes above £1,000, additional identity verification is required.'),
                ('3. Timeline',
                 'Once verification is complete, payment is processed within 5 UK business days.'),
                ('4. Withdrawal',
                 'Wallet withdrawal (if enabled) is subject to KYC, source-of-funds review and anti-fraud checks.'),
            ],
        ),
    },
    # ---------- 21. Data Retention ----------
    {
        'slug': 'data-retention',
        'title': 'Data Retention Policy',
        'owner': 'Data Protection Officer',
        'ai_generated': True,
        'content': _draft(
            "How long Prize League retains personal data and why.",
            [
                ('1. Account data',
                 'Retained for the life of the account plus 6 years to meet regulatory and tax record-keeping obligations.'),
                ('2. Payment records',
                 'Retained for 6 years from the transaction date.'),
                ('3. AML / KYC records',
                 'Retained for at least 5 years from the end of the customer relationship.'),
                ('4. Marketing preferences',
                 'Retained until you withdraw consent, at which point they are deleted or anonymised.'),
                ('5. Right to erasure',
                 'You may request erasure of personal data. Records required for legal, regulatory, tax or audit purposes are retained; all other data is deleted.'),
            ],
        ),
    },
    # ---------- 22. Suspension / Closure / Appeals ----------
    {
        'slug': 'account-closure',
        'title': 'Account Suspension, Closure and Appeals Policy',
        'owner': 'Trust & Safety',
        'ai_generated': True,
        'content': _draft(
            "How account suspensions and closures are decided, communicated "
            "and appealed.",
            [
                ('1. Grounds',
                 'Fraud, breach of Terms, chargeback, sanctions match, safeguarding concern, prolonged inactivity, verified user request.'),
                ('2. Communication',
                 'Users are notified of the decision, the reason, the effective date and any impact on funds/entries.'),
                ('3. Appeal',
                 'Users have 30 days to appeal via support@prizeleague.co.uk. Appeals are reviewed by a member of staff independent of the original decision.'),
            ],
        ),
    },
    # ---------- 23. Vulnerable Customer ----------
    {
        'slug': 'vulnerable',
        'title': 'Vulnerable Customer Policy',
        'owner': 'Player Protection',
        'ai_generated': True,
        'content': _draft(
            "Prize League identifies and protects customers who may be in "
            "vulnerable circumstances.",
            [
                ('1. Indicators',
                 'Health, life events, financial resilience or capability may all affect a customer\'s ability to engage with our platform safely.'),
                ('2. Interventions',
                 'Deposit limits, cool-off periods, additional friction on high-spend behaviour, direct outreach where appropriate.'),
                ('3. Staff training',
                 'Support agents are trained to recognise indicators of vulnerability and escalate appropriately.'),
            ],
        ),
    },
    # ---------- 24. Age & Eligibility ----------
    {
        'slug': 'age-eligibility',
        'title': 'Age and Eligibility Policy',
        'owner': 'Compliance',
        'ai_generated': True,
        'content': _draft(
            "Only UK residents aged 18 or over may register or participate.",
            [
                ('1. Verification',
                 'Age is verified during KYC. Suspected underage accounts are suspended pending verification.'),
                ('2. Consequences of underage participation',
                 'Underage accounts are closed. Any entries are void and any deposits are refunded to the original payment method.'),
            ],
        ),
    },
    # ---------- 25. Cybersecurity & Account Protection ----------
    {
        'slug': 'cybersecurity',
        'title': 'Cybersecurity and Account Protection Policy',
        'owner': 'IT Security',
        'ai_generated': True,
        'content': _draft(
            "Measures Prize League takes to protect user accounts and its "
            "platform, and what users can do themselves.",
            [
                ('1. Platform controls',
                 'HTTPS enforced everywhere; secrets stored in environment vaults; JWT signed with rotated secrets; '
                 'passwords hashed with bcrypt; rate-limiting on authentication endpoints; audit logs on all admin actions.'),
                ('2. User controls',
                 'Choose a strong unique password. Enable multi-factor authentication if offered. Never share your login details. '
                 'Contact support@prizeleague.co.uk immediately if you suspect unauthorised access.'),
                ('3. Incident response',
                 'Suspected security incidents follow our documented response plan, including user notification where required by UK GDPR.'),
            ],
        ),
    },
    # ---------- 26. Support Service ----------
    {
        'slug': 'support',
        'title': 'Support Service Policy',
        'owner': 'Customer Care',
        'ai_generated': True,
        'content': _draft(
            "Prize League Support Service standards and response times.",
            [
                ('1. Channels',
                 'Email: support@prizeleague.co.uk. In-app ticketing via Support Centre.'),
                ('2. Response targets',
                 'Acknowledgement within 2 UK business days. Resolution target: 5 UK business days for standard cases.'),
                ('3. Escalation queues',
                 'Payments, Technical, Competition Operations, Fraud, AML, Complaints, Data Protection, Management Escalation.'),
            ],
        ),
    },
    # ---------- 27. Accessibility ----------
    {
        'slug': 'accessibility',
        'title': 'Accessibility Statement',
        'owner': 'Product',
        'ai_generated': True,
        'content': _draft(
            "Prize League aims to make its platform accessible to the widest "
            "possible audience.",
            [
                ('1. Standards',
                 'We target WCAG 2.1 Level AA compliance across our website.'),
                ('2. Known limitations',
                 'Some third-party embeds may not fully conform. We are working with providers to improve accessibility.'),
                ('3. Reporting an issue',
                 'Email support@prizeleague.co.uk with the URL and a description of the issue and we will respond within 5 UK business days.'),
            ],
        ),
    },
]
