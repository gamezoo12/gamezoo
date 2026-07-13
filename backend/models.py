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
    status: str = 'live'  # live | drawn | archived
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
    email: EmailStr
    name: str
    picture: Optional[str] = None
    password_hash: Optional[str] = None  # only for email/password users
    method: Literal['email', 'google'] = 'email'
    role: Literal['user', 'admin'] = 'user'
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserPublic(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: str
    method: str


class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="Minimum 8 characters")
    name: str = Field(..., min_length=1)


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class CartItem(BaseModel):
    contest_id: str
    qty: int
    skill_answer: str  # user's answer, will be validated server-side


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
