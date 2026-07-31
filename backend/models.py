from datetime import datetime, timezone
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List, Literal
import uuid


def new_id(prefix: str = 'id') -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class SkillQuestion(BaseModel):
    q: str
    options: List[str]
    answer: str
    type: str = 'math'


class Contest(BaseModel):
    contest_id: str = Field(default_factory=lambda: new_id('c'))
    slug: str
    title: str
    subtitle: str = ''
    category: str = 'prize-draws'
    tag: str = 'Prize Draws'
    price: float = 1.0
    tickets_sold: int = 0
    tickets_total: int = 150
    prize_amount: float = 100.0
    end_date: datetime
    image: str
    jackpot: bool = False
    featured: bool = False
    skill_question: SkillQuestion
    # Optional game to play after ticket purchase. If None, winner is picked by admin/scheduler.
    game_type: Optional[str] = None  # e.g. 'jigsaw_3x3', 'memory_match', 'number_sequence', ...
    game_config: dict = Field(default_factory=dict)  # per-game options (image url, difficulty, time limit)
    max_attempts: int = 3  # legacy alias for attempts_per_ticket — kept for back-compat
    attempts_per_ticket: int = 3  # Total attempts = tickets_bought * attempts_per_ticket (1..10)
    status: str = 'live'  # live | drawn | archived

    # ----- Extended admin-editable fields (added for Phase-1 launch spec) -----
    short_description: Optional[str] = None
    full_description: Optional[str] = None
    how_to_enter: Optional[str] = None
    skill_instructions: Optional[str] = None
    eligibility: Optional[str] = None
    max_tickets_per_user: Optional[int] = None
    open_date: Optional[datetime] = None
    draw_date: Optional[datetime] = None
    prize_details: Optional[str] = None
    num_prizes: int = 1
    prize_values: Optional[str] = None   # free-text or JSON list — admin manages
    winner_method: Optional[str] = None  # human-readable
    scoring_method: Optional[str] = None
    tiebreak_method: Optional[str] = None
    verification_method: Optional[str] = None
    prize_credit_timeframe: Optional[str] = None
    refund_conditions: Optional[str] = None
    important_info: Optional[str] = None
    contest_rules: Optional[str] = None
    terms_acknowledgement: Optional[str] = None
    country_restrictions: Optional[str] = None
    age_restriction: Optional[str] = '18+'
    mobile_image: Optional[str] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    publication_status: Literal['draft', 'published'] = 'published'

    # Contest engine (Type 1 = leaderboard shipped; 2 & 3 are locked behind a
    # Super Admin feature flag pending legal review — see Company Settings).
    engine_type: Literal['leaderboard', 'random_draw', 'instant_win'] = 'leaderboard'

    # Free postal entry per-contest toggle
    free_postal_entry_available: bool = False
    free_postal_entry_instructions: Optional[str] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Wallet(BaseModel):
    user_id: str
    balance: float = 0.0
    lifetime_topup: float = 0.0
    lifetime_spend: float = 0.0
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class WalletTx(BaseModel):
    tx_id: str = Field(default_factory=lambda: new_id('tx'))
    user_id: str
    kind: Literal['topup', 'spend', 'refund', 'admin_adjust', 'referral_bonus']
    amount: float  # positive for credits, negative for debits
    balance_after: float
    note: str = ''
    ref_order_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Referral(BaseModel):
    referral_id: str = Field(default_factory=lambda: new_id('ref'))
    referrer_user_id: str  # who invited
    referred_user_id: str  # who was invited
    code: str
    status: Literal['pending', 'completed'] = 'pending'
    reward_ticket_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class GameScore(BaseModel):
    score_id: str = Field(default_factory=lambda: new_id('s'))
    contest_id: str
    ticket_id: str
    user_id: str
    user_name: str
    game_type: str
    points: int
    duration_ms: int
    accuracy: float  # 0.0 - 1.0
    attempts_used: int = 1
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ContestPublic(BaseModel):
    contest_id: str
    slug: str
    title: str
    subtitle: str
    category: str
    tag: str
    price: float
    tickets_sold: int
    tickets_total: int
    prize_amount: float
    end_date: datetime
    image: str
    jackpot: bool
    featured: bool
    status: str
    # Skill question WITHOUT the answer for public consumption
    skill_question_q: str
    skill_question_options: List[str]


class User(BaseModel):
    user_id: str = Field(default_factory=lambda: new_id('user'))
    public_id: Optional[str] = None  # sequential PLxxxxx — assigned atomically at register
    email: EmailStr
    name: str
    username: Optional[str] = None  # auto-generated: firstname + DOB-day + NN
    picture: Optional[str] = None
    password_hash: Optional[str] = None  # only for email/password users
    method: Literal['email', 'google'] = 'email'
    role: Literal['user', 'admin', 'super_admin', 'operator', 'support'] = 'user'
    must_change_password: bool = False  # forced on Super Admin first login
    referral_code: str = Field(default_factory=lambda: uuid.uuid4().hex[:8].upper())
    referred_by: Optional[str] = None  # user_id of referrer
    phone: Optional[str] = None  # E.164 format, e.g. +447xxxxxxxxx
    phone_verified: bool = False
    dob: Optional[str] = None  # ISO date YYYY-MM-DD
    address: Optional[str] = None
    terms_accepted_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserPublic(BaseModel):
    user_id: str
    public_id: Optional[str] = None
    email: str
    name: str
    username: Optional[str] = None
    picture: Optional[str] = None
    role: str
    method: str
    phone: Optional[str] = None
    phone_verified: bool = False
    dob: Optional[str] = None
    address: Optional[str] = None
    terms_accepted_at: Optional[datetime] = None
    must_change_password: bool = False


class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Minimum 8 characters")
    name: str = Field(..., min_length=1)
    phone: str = Field(..., min_length=6, max_length=32)
    otp_code: str = Field(..., min_length=4, max_length=10)
    accept_terms: bool = Field(..., description="Must be true")
    dob: str = Field(..., description="YYYY-MM-DD, 18+ enforced server-side")
    address: Optional[str] = None
    referral_code: Optional[str] = None


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class CartItem(BaseModel):
    contest_id: str
    qty: int
    skill_answer: str  # user's answer, will be validated server-side
    # New (Feb 2026): HMAC-signed token proving the user's answer belongs to a
    # dynamic skill challenge that was actually issued by us. Optional to
    # preserve backward compatibility with legacy static-question contests.
    challenge_token: Optional[str] = None


class CheckoutInput(BaseModel):
    items: List[CartItem]


class Order(BaseModel):
    order_id: str = Field(default_factory=lambda: new_id('o'))
    user_id: str
    items: list  # [{contest_id, qty, price, prize_title}]
    total: float
    status: str = 'paid'  # paid | pending | refunded
    method: str = 'mock'  # mock | stripe
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Ticket(BaseModel):
    ticket_id: str = Field(default_factory=lambda: new_id('t'))
    order_id: str
    user_id: str
    contest_id: str
    ticket_number: int
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Winner(BaseModel):
    winner_id: str = Field(default_factory=lambda: new_id('w'))
    contest_id: str
    user_id: str
    user_name: str
    ticket_number: int
    prize_amount: float
    prize_title: str
    drawn_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    paid_out: bool = False
