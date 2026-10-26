import os
import random
from datetime import datetime, timedelta
from typing import Literal

import httpx
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import AliasChoices, BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from chat_service import ChatRequest, ChatResponse, process_chat_message
from database import Application, get_db, init_db
from mocks import CLIENTS
from ollama_service import ollama_service
from scoring import evaluate_credit


class ApplicationCreateRequest(BaseModel):
    amount: float = Field(gt=0)
    term: int = Field(gt=0)
    client_id: str = "client_001"
    product_id: str = Field(
        default="working",
        validation_alias=AliasChoices("product_id", "productId"),
    )
    purpose: str = "Пополнение оборотных средств"


app = FastAPI(title="Smart Credit Cabinet API", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Для локального демонстрационного прототипа.
    allow_methods=["*"],
    allow_headers=["*"],
)

PRODUCTS = {
    "working": {"name": "Оборотный кредит", "rate": 18.5},
    "development": {"name": "Кредит на развитие", "rate": 15.9},
    "micro": {"name": "Микрозайм", "rate": 22.0},
}
FINAL_DECISIONS = {"approved", "counter", "rejected"}


@app.on_event("startup")
async def startup():
    await init_db()


@app.get("/health")
async def health():
    return {"status": "ok", "service": "backend"}


@app.get("/health/ollama")
async def health_ollama():
    base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(base_url)
            if resp.status_code < 500:
                return {"status": "healthy", "service": "ollama"}
    except Exception:
        pass
    return {"status": "unhealthy", "service": "ollama"}


@app.post("/api/auth/login")
async def login(phone: str = Query(...), name: str = Query(...), company: str = Query(default="")):
    client = CLIENTS["client_001"]
    return {
        "token": "demo-jwt-token",
        "user": {"name": name, "phone": phone, "role": "client", "client_id": "client_001"},
        "company": {
            "name": company or client["name"],
            "inn": client["inn"],
            "okved": client["okved"],
            "age": client["age"],
            "revenue": client["revenue"],
            "employees": 12,
            "accountTurnover": 2_150_000,
            "preApprovedLimit": client["pre_approved_limit"],
            "account": client["account"],
        },
    }


@app.get("/api/clients/{client_id}")
async def get_client(client_id: str):
    client = CLIENTS.get(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@app.post("/api/clients/{client_id}/news")
async def get_personalized_news(client_id: str):
    profile = CLIENTS.get(client_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Client not found")
    return {
        "client_id": client_id,
        "industry": profile.get("industry"),
        "news": await ollama_service.generate_news(profile),
        "source": "ollama_or_fallback",
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, client_id: str = Query(default="client_001")):
    if client_id not in CLIENTS:
        raise HTTPException(status_code=404, detail="Client not found")
    return await process_chat_message(req, client_id)


def _app_to_dict(item: Application) -> dict:
    decision_data = item.decision_data or {}
    return {
        "id": item.id,
        "client_id": item.client_id,
        "companyName": item.company_name or "Клиент не указан",
        "inn": item.inn or "—",
        "productId": item.product_id or "working",
        "productName": item.product_name or PRODUCTS.get(item.product_id or "working", PRODUCTS["working"])["name"],
        "rate": item.rate or decision_data.get("rate") or 0,
        "amount": item.amount,
        "term": item.term,
        "purpose": item.purpose or "",
        "payment": item.payment or decision_data.get("payment") or 0,
        "account": item.account or "—",
        "signCode": item.sign_code or "",
        "status": item.status or "scoring",
        "score": item.score or decision_data.get("score") or 0,
        "factors": item.factors or decision_data.get("factors") or [],
        "decisionComment": item.decision_comment or "",
        "counterOffer": item.counter_offer,
        "decisionData": decision_data,
        "createdAt": item.created_at.isoformat() if item.created_at else None,
        "signedAt": item.signed_at.isoformat() if item.signed_at else None,
        "issuedAt": item.issued_at.isoformat() if item.issued_at else None,
        "firstPaymentDate": item.first_payment_date,
        "history": item.history or [],
    }


@app.post("/api/applications")
async def create_application(req: ApplicationCreateRequest, db: AsyncSession = Depends(get_db)):
    client = CLIENTS.get(req.client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if req.product_id not in PRODUCTS:
        raise HTTPException(status_code=422, detail="Unknown product_id")

    # Скоринг — только рекомендация. Он НЕ принимает финальное решение по заявке.
    score_result = evaluate_credit(req.amount, req.term, req.client_id)
    product = PRODUCTS[req.product_id]
    monthly_rate = product["rate"] / 100 / 12
    payment_factor = (1 + monthly_rate) ** req.term
    monthly_payment = req.amount * monthly_rate * payment_factor / (payment_factor - 1)
    now = datetime.utcnow()
    history = [
        {"at": now.isoformat(), "title": "Заявка создана", "text": "Заявка зарегистрирована и ожидает проверки специалистом."},
        {"at": now.isoformat(), "title": "Скоринг выполнен", "text": "Предварительная оценка рассчитана. Финальное решение принимает кредитный специалист."},
    ]
    preliminary = {
        **score_result,
        "preliminary_decision": score_result.get("decision"),
        "decision": None,
        "note": "Предварительная рекомендация скоринга не является решением банка.",
    }
    new_app = Application(
        client_id=req.client_id,
        company_name=client["name"],
        inn=client["inn"],
        amount=req.amount,
        term=req.term,
        product_id=req.product_id,
        product_name=product["name"],
        rate=product["rate"],
        purpose=req.purpose,
        payment=round(monthly_payment, 2),
        account=client["account"],
        sign_code=f"{random.randint(0, 9999):04d}",
        status="scoring",
        score=score_result.get("score", 0),
        factors=score_result.get("factors", []),
        decision_data=preliminary,
        decision_comment=None,
        counter_offer=None,
        history=history,
    )
    db.add(new_app)
    await db.commit()
    await db.refresh(new_app)
    return _app_to_dict(new_app)


@app.get("/api/applications")
async def get_applications(client_id: str = Query(default="client_001"), db: AsyncSession = Depends(get_db)):
    stmt = select(Application).order_by(Application.created_at.desc())
    if client_id:
        stmt = stmt.where(Application.client_id == client_id)
    result = await db.execute(stmt)
    return [_app_to_dict(item) for item in result.scalars().all()]


@app.get("/api/applications/{app_id}")
async def get_application(app_id: int, db: AsyncSession = Depends(get_db)):
    item = await db.get(Application, app_id)
    if not item:
        raise HTTPException(status_code=404, detail="Application not found")
    return _app_to_dict(item)


@app.patch("/api/applications/{app_id}/decision")
async def bank_decision(
    app_id: int,
    status: Literal["approved", "counter", "rejected"] = Query(...),
    comment: str = Query(default=""),
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(Application, app_id)
    if not item:
        raise HTTPException(status_code=404, detail="Application not found")
    if item.status != "scoring":
        raise HTTPException(status_code=409, detail="Решение уже принято или заявка больше не ожидает рассмотрения")

    defaults = {
        "approved": "Заявка одобрена кредитным специалистом на запрошенных условиях.",
        "counter": "Банк предлагает альтернативные условия с учётом оценки риска.",
        "rejected": "Кредитный специалист отказал по результатам проверки заявки.",
    }
    item.status = status
    item.decision_comment = comment.strip() or defaults[status]

    if status == "counter":
        counter_amount = max(50_000, round((item.amount * 0.7) / 50_000) * 50_000)
        counter_term = item.term + 6
        monthly_rate = (item.rate or 18.5) / 100 / 12
        factor = (1 + monthly_rate) ** counter_term
        counter_payment = counter_amount * monthly_rate * factor / (factor - 1)
        item.counter_offer = {
            "amount": min(counter_amount, item.amount),
            "term": counter_term,
            "rate": item.rate or 18.5,
            "payment": round(counter_payment, 2),
        }

    item.history = (item.history or []) + [
        {"at": datetime.utcnow().isoformat(), "title": "Решение принято", "text": item.decision_comment}
    ]
    await db.commit()
    await db.refresh(item)
    return _app_to_dict(item)


@app.post("/api/applications/{app_id}/offer/accept")
async def accept_offer(app_id: int, db: AsyncSession = Depends(get_db)):
    item = await db.get(Application, app_id)
    if not item:
        raise HTTPException(status_code=404, detail="Application not found")
    if item.status not in {"approved", "counter"}:
        raise HTTPException(status_code=409, detail="Принять можно только одобренное предложение")

    if item.status == "counter" and item.counter_offer:
        item.amount = item.counter_offer["amount"]
        item.term = item.counter_offer["term"]
        item.payment = item.counter_offer["payment"]
        item.rate = item.counter_offer.get("rate", item.rate)
        item.decision_comment = "Клиент принял предложенные банком альтернативные условия."

    item.status = "signing"
    item.history = (item.history or []) + [
        {"at": datetime.utcnow().isoformat(), "title": "Предложение принято", "text": "Клиент принял условия. Документы подготовлены к подписанию."}
    ]
    await db.commit()
    await db.refresh(item)
    return {"application": _app_to_dict(item), "signCode": item.sign_code}


@app.post("/api/applications/{app_id}/sign")
async def sign_documents(app_id: int, code: str = Query(...), db: AsyncSession = Depends(get_db)):
    item = await db.get(Application, app_id)
    if not item:
        raise HTTPException(status_code=404, detail="Application not found")
    if item.status != "signing":
        raise HTTPException(status_code=409, detail="Заявка не находится на этапе подписания")
    if not item.sign_code or code.strip() != item.sign_code:
        raise HTTPException(status_code=400, detail="Код подтверждения не совпадает")

    item.status = "signed"
    item.signed_at = datetime.utcnow()
    item.history = (item.history or []) + [
        {"at": item.signed_at.isoformat(), "title": "Документы подписаны", "text": "Договор подтверждён кодом подтверждения."}
    ]
    await db.commit()
    await db.refresh(item)
    return _app_to_dict(item)


@app.post("/api/applications/{app_id}/disburse")
async def disburse(app_id: int, db: AsyncSession = Depends(get_db)):
    item = await db.get(Application, app_id)
    if not item:
        raise HTTPException(status_code=404, detail="Application not found")
    if item.status != "signed":
        raise HTTPException(status_code=409, detail="Выдача возможна только после подписания документов")

    now = datetime.utcnow()
    first_payment = now.replace(day=28) + timedelta(days=30)
    item.status = "issued"
    item.issued_at = now
    item.first_payment_date = first_payment.strftime("%d.%m.%Y")
    item.history = (item.history or []) + [
        {"at": now.isoformat(), "title": "Деньги перечислены", "text": f"Демо-выдача {int(item.amount):,} ₽ на счёт {item.account or 'клиента'}. Реальный перевод не выполняется."}
    ]
    await db.commit()
    await db.refresh(item)
    return _app_to_dict(item)
