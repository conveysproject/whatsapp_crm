from dataclasses import dataclass


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


STAGE_WEIGHTS = {
    "customer": 30,
    "loyal": 40,
    "prospect": 20,
    "lead": 10,
    "churned": 0,
}


class TrustScoreModel:
    """Heuristic Trust Score (0-100). Replaced with scikit-learn model in Sprint 23."""

    def compute(self, features: ContactFeatures) -> int:
        score = 0.0

        score += STAGE_WEIGHTS.get(features.lifecycle_stage, 10)

        if features.message_count > 0:
            response_ratio = min(features.outbound_count / features.message_count, 1.0)
            score += response_ratio * 20

        if features.days_since_last_message <= 7:
            score += 20
        elif features.days_since_last_message <= 30:
            score += 10
        elif features.days_since_last_message <= 90:
            score += 5

        if features.deal_count > 0:
            score += min(features.deal_count * 5, 10)
        if features.total_deal_value > 0:
            score += min(features.total_deal_value / 100_000 * 10, 10)

        return min(max(int(score), 0), 100)
