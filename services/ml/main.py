from fastapi import FastAPI
from .routers import trust_score, predictions

app = FastAPI(title="WBMSG ML Service", version="1.0.0")

app.include_router(trust_score.router)
app.include_router(predictions.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "ml"}
