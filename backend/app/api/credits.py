"""Live key status and the credit tracker (see app/credits.py for what "remaining" means)."""
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import credits, database

router = APIRouter(prefix="/v1/credits", tags=["credits"])


class ProviderCredit(BaseModel):
    provider: str
    label: str
    key_status: str  # valid | invalid | unreachable | missing
    balance_usd: Optional[float] = None
    set_at: Optional[str] = None
    spent_usd: Optional[float] = None
    remaining_usd: Optional[float] = None


class CreditSummary(BaseModel):
    providers: list[ProviderCredit]
    total_balance_usd: Optional[float] = None
    total_spent_usd: Optional[float] = None
    total_remaining_usd: Optional[float] = None
    tracked_providers: int
    lifetime_spend_usd: float


class CreditSet(BaseModel):
    balance_usd: float = Field(ge=0, le=1_000_000)


@router.get("", response_model=CreditSummary)
async def get_credits() -> dict:
    return credits.summary()


@router.put("/{provider}", response_model=CreditSummary)
async def set_credit(provider: str, req: CreditSet) -> dict:
    if provider not in {p for p, _ in credits.PROVIDERS}:
        raise HTTPException(status_code=404, detail="Unknown provider")
    database.set_credit_account(provider, req.balance_usd)
    return credits.summary()


@router.delete("/{provider}", response_model=CreditSummary)
async def clear_credit(provider: str) -> dict:
    database.clear_credit_account(provider)
    return credits.summary()
