from fastapi import APIRouter
from pydantic import BaseModel
from ..models.trust_score import TrustScoreModel, ContactFeatures

router = APIRouter(prefix="/trust-score", tags=["trust-score"])
model = TrustScoreModel()


class TrustScoreRequest(BaseModel):
    lifecycle_stage: str = "lead"
    message_count: int = 0
    inbound_count: int = 0
    outbound_count: int = 0
    days_since_last_message: int = 999
    deal_count: int = 0
    total_deal_value: float = 0.0
    tag_count: int = 0


class TrustScoreResponse(BaseModel):
    score: int
    label: str


def score_to_label(score: int) -> str:
    if score >= 80:
        return "high"
    if score >= 50:
        return "medium"
    if score >= 25:
        return "low"
    return "very_low"


@router.post("", response_model=TrustScoreResponse)
def compute_trust_score(req: TrustScoreRequest) -> TrustScoreResponse:
    features = ContactFeatures(**req.model_dump())
    score = model.compute(features)
    return TrustScoreResponse(score=score, label=score_to_label(score))
