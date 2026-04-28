from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/predict", tags=["predictions"])


class ChurnRequest(BaseModel):
    trust_score: int
    days_since_last_message: int
    lifecycle_stage: str


class ChurnResponse(BaseModel):
    churn_probability: float
    is_at_risk: bool


class LtvRequest(BaseModel):
    deal_count: int
    total_deal_value: float
    lifecycle_stage: str


class LtvResponse(BaseModel):
    predicted_ltv: float


@router.post("/churn", response_model=ChurnResponse)
def predict_churn(req: ChurnRequest) -> ChurnResponse:
    p = 0.0
    if req.trust_score < 30:
        p += 0.4
    if req.days_since_last_message > 30:
        p += 0.3
    if req.lifecycle_stage == "churned":
        p += 0.3
    prob = min(p, 1.0)
    return ChurnResponse(churn_probability=round(prob, 2), is_at_risk=prob > 0.5)


@router.post("/ltv", response_model=LtvResponse)
def predict_ltv(req: LtvRequest) -> LtvResponse:
    avg = req.total_deal_value / max(req.deal_count, 1)
    future_deals = {"lead": 1, "prospect": 2, "customer": 4, "loyal": 6, "churned": 0}.get(req.lifecycle_stage, 1)
    return LtvResponse(predicted_ltv=round(avg * future_deals, 2))
