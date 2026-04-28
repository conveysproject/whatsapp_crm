from dataclasses import dataclass

import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression


@dataclass
class ContactFeatures:
    lifecycle_stage: str
    message_count: int
    inbound_count: int
    outbound_count: int
    days_since_last_message: int
    deal_count: int
    total_deal_value: float
    tag_count: int


STAGE_SCORES = {
    "loyal": 5,
    "customer": 4,
    "prospect": 3,
    "lead": 2,
    "churned": 1,
}

# Synthetic training data: [stage_score, response_ratio, recency_score, deal_score] → trust (0-100)
_X_TRAIN = np.array([
    [5, 1.0, 1.0, 1.0],
    [4, 0.8, 0.9, 0.8],
    [3, 0.5, 0.7, 0.4],
    [2, 0.3, 0.5, 0.1],
    [1, 0.0, 0.0, 0.0],
    [4, 1.0, 1.0, 0.5],
    [3, 0.7, 0.8, 0.3],
    [2, 0.2, 0.3, 0.2],
], dtype=float)

_Y_TRAIN = np.array([92, 78, 55, 30, 5, 82, 62, 22], dtype=float)


class TrustScoreModel:
    def __init__(self) -> None:
        from sklearn.linear_model import Ridge
        self._model = Pipeline([("scaler", StandardScaler()), ("reg", Ridge(alpha=1.0))])
        self._model.fit(_X_TRAIN, _Y_TRAIN)

    def _features(self, f: ContactFeatures) -> np.ndarray:
        stage = STAGE_SCORES.get(f.lifecycle_stage, 2)
        response_ratio = f.outbound_count / max(f.message_count, 1)
        if f.days_since_last_message <= 7:
            recency = 1.0
        elif f.days_since_last_message <= 30:
            recency = 0.7
        elif f.days_since_last_message <= 90:
            recency = 0.4
        else:
            recency = 0.1
        deal_score = min(f.deal_count * 0.1 + f.total_deal_value / 1_000_000, 1.0)
        return np.array([[stage, response_ratio, recency, deal_score]])

    def compute(self, features: ContactFeatures) -> int:
        score = self._model.predict(self._features(features))[0]
        return int(min(max(round(score), 0), 100))
