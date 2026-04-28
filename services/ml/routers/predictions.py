import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

router = APIRouter(prefix="/predict", tags=["predictions"])

STAGE_IDX = {"lead": 0, "prospect": 1, "customer": 2, "loyal": 3, "churned": 4}

# ── Churn classifier ────────────────────────────────────────────────────────
# Features: [trust_score, days_since_last_msg, stage_idx]
_CHURN_X = np.array([
    [90, 2, 3], [80, 5, 2], [70, 10, 1], [60, 20, 1],
    [40, 35, 0], [30, 60, 0], [10, 90, 4], [5, 120, 4],
    [85, 3, 3], [50, 25, 1],
], dtype=float)
_CHURN_Y = np.array([0, 0, 0, 0, 1, 1, 1, 1, 0, 1])

_churn_pipeline = Pipeline([
    ("scaler", StandardScaler()),
    ("clf", GradientBoostingClassifier(n_estimators=50, random_state=42)),
])
_churn_pipeline.fit(_CHURN_X, _CHURN_Y)

# ── LTV regressor ────────────────────────────────────────────────────────────
# Features: [deal_count, total_deal_value, stage_idx]
_LTV_X = np.array([
    [0, 0, 0], [1, 500, 1], [2, 2000, 2], [5, 15000, 3],
    [10, 80000, 3], [0, 0, 4], [3, 5000, 2], [7, 40000, 3],
], dtype=float)
_LTV_Y = np.array([0, 1000, 5000, 40000, 200000, 0, 12000, 100000], dtype=float)

_ltv_pipeline = Pipeline([
    ("scaler", StandardScaler()),
    ("reg", GradientBoostingRegressor(n_estimators=50, random_state=42)),
])
_ltv_pipeline.fit(_LTV_X, _LTV_Y)


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
    stage = STAGE_IDX.get(req.lifecycle_stage, 0)
    x = np.array([[req.trust_score, req.days_since_last_message, stage]])
    prob = float(_churn_pipeline.predict_proba(x)[0][1])
    return ChurnResponse(churn_probability=round(prob, 2), is_at_risk=prob > 0.5)


@router.post("/ltv", response_model=LtvResponse)
def predict_ltv(req: LtvRequest) -> LtvResponse:
    stage = STAGE_IDX.get(req.lifecycle_stage, 0)
    x = np.array([[req.deal_count, req.total_deal_value, stage]])
    ltv = float(_ltv_pipeline.predict(x)[0])
    return LtvResponse(predicted_ltv=round(max(ltv, 0), 2))
