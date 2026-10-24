from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
import httpx
import random

from database import init_db, get_db, Application
from mocks import CLIENTS
from ollama_service import ollama_service
from chat_service import process_chat_message, ChatRequest, ChatResponse
from scoring import evaluate_credit

app = FastAPI(title="Smart Credit Cabinet API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await init_db()


# ---------- Health ----------
@app.get("/health")
async def health():
    return {"status": "ok", "service": "backend"}


@app.get("/health/ollama")
async def health_ollama():
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get("http://localhost:11434")
            if resp.status_code == 200:
                return {"status": "healthy", "service": "ollama"}
            return {"status": "unhealthy", "service": "ollama"}
    except Exception:
        return {"status": "unhealthy", "service": "ollama"}


# ---------- Auth (упрощённый, без реальной JWT — для прототипа) ----------
@app.post("/api/auth/login")
async def login(phone: str = Query(...), name: str = Query(...), company: str = Query(default="")):
    """Возвращает токен и профиль клиента + компании (как из ЕГРЮЛ)."""
    client = CLIENTS.get("client_001")  # Для прототипа — всегда первый клиент
    return {
        "token": "demo-jwt-token",
        "user": {"name": name, "phone": phone, "role": "client"},
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


# ---------- Клиент и новости ----------
@app.get("/api/clients/{client_id}")
async def get_client(client_id: str):
    if client_id not in CLIENTS:
        raise HTTPException(status_code=404, detail="Client not found")
    return CLIENTS[client_id]


@app.post("/api/clients/{client_id}/news")
async def get_personalized_news(client_id: str):
    profile = CLIENTS.get(client_id, {})
    if not profile:
        raise HTTPException(status_code=404, detail="Client not found")
    news = await ollama_service.generate_news(profile)
    return {
        "client_id": client_id,
        "industry": profile.get("industry"),
        "news": news,
        "source": "ollama",
    }


# ---------- Чат ----------
@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, client_id: str = Query(default="client_001")):
    return await process_chat_message(req, client_id)


# ---------- Заявки: CRUD и жизненный цикл ----------
def _app_to_dict(a: Application) -> dict:
    return {
        "id": a.id,
        "client_id": a.client_id,
        "companyName": a.company_name,
        "inn": a.inn,
        "productId": a.product_id,
        "productName": a.product_name,
        "rate": a.rate,
        "amount": a.amount,
        "term": a.term,
        "purpose": a.purpose,
        "payment": a.payment,
        "account": a.account,
        "signCode": a.sign_code,
        "status": a.status,
        "score": a.score,
        "factors": a.factors or [],
        "decisionComment": a.decision_comment or "",
        "counterOffer": a.counter_offer,
        "createdAt": a.created_at.isoformat() if a.created_at else None,
        "signedAt": a.signed_at.isoformat() if a.signed_at else None,
        "issuedAt": a.issued_at.isoformat() if a.issued_at else None,
        "firstPaymentDate": a.first_payment_date,
        "history": a.history or [],
    }


@app.post("/api/applications")
async def create_application(
    amount: float = Query(...),
    term: int = Query(...),
    client_id: str = Query(...),
    product_id: str = Query(default="prod_1"),
    product_name: str = Query(default="Экспресс-оборот"),
    purpose: str = Query(default="Пополнение оборотных средств"),
    db: AsyncSession = Depends(get_db),
):
    client = CLIENTS.get(client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    decision = evaluate_credit(amount, term, client_id)
    now = datetime.utcnow()
    history = [
        {"at": now.isoformat(), "title": "Заявка создана", "text": "Данные приняты, проверка полноты пройдена"},
        {"at": now.isoformat(), "title": "Скоринг выполнен",
         "text": f"Балл {decision['score']} из 100. Решение принимает кредитный специалист."},
    ]

    new_app = Application(
        client_id=client_id,
        company_name=client["name"],
        inn=client["inn"],
        amount=amount,
        term=term,
        product_id=product_id,
        product_name=product_name,
        rate=decision["rate"],
        purpose=purpose,
        payment=decision["payment"],
        account=client["account"],
        sign_code=str(1000 + random.randint(0, 8999)),
        status="scoring",
        score=decision["score"],
        factors=decision["factors"],
        decision_data=decision,
        history=history,
    )
    db.add(new_app)
    await db.commit()
    await db.refresh(new_app)
    return _app_to_dict(new_app)


@app.get("/api/applications")
async def list_applications(client_id: str = Query(default=None), db: AsyncSession = Depends(get_db)):
    stmt = select(Application).order_by(Application.created_at.desc())
    if client_id:
        stmt = stmt.where(Application.client_id == client_id)
    result = await db.execute(stmt)
    return [_app_to_dict(a) for a in result.scalars().all()]


@app.get("/api/applications/{app_id}")
async def get_application(app_id: int, db: AsyncSession = Depends(get_db)):
    app_obj = await db.get(Application, app_id)
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")
    return _app_to_dict(app_obj)


@app.patch("/api/applications/{app_id}/decision")
async def bank_decision(
    app_id: int,
    status: str = Query(...),
    comment: str = Query(default=""),
    db: AsyncSession = Depends(get_db),
):
    """Решение банковского андеррайтера: approved / counter / rejected."""
    app_obj = await db.get(Application, app_id)
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")

    defaults = {
        "approved": "Одобрено на запрошенных условиях. Оборот стабилен, долговая нагрузка в норме.",
        "counter": "Одобрено на иных условиях: сумма снижена до 70% от запрошенной из-за текущей долговой нагрузки.",
        "rejected": "Отказ по результатам скоринга: платёж превышает допустимую долю оборота.",
    }
    app_obj.status = status
    app_obj.decision_comment = comment or defaults.get(status, "")

    if status == "counter":
        counter_amount = round((app_obj.amount * 0.7) / 50000) * 50000
        counter_term = app_obj.term + 6
        monthly_rate = app_obj.rate / 100 / 12
        counter_payment = (
            counter_amount * (monthly_rate * (1 + monthly_rate) ** counter_term)
            / ((1 + monthly_rate) ** counter_term - 1)
        )
        app_obj.counter_offer = {
            "amount": counter_amount,
            "term": counter_term,
            "rate": app_obj.rate,
            "payment": round(counter_payment, 2),
        }

    app_obj.history = (app_obj.history or []) + [
        {"at": datetime.utcnow().isoformat(), "title": "Решение принято", "text": app_obj.decision_comment}
    ]
    await db.commit()
    await db.refresh(app_obj)
    return _app_to_dict(app_obj)


@app.post("/api/applications/{app_id}/offer/accept")
async def accept_offer(app_id: int, db: AsyncSession = Depends(get_db)):
    app_obj = await db.get(Application, app_id)
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")
    app_obj.status = "signing"
    app_obj.history = (app_obj.history or []) + [
        {"at": datetime.utcnow().isoformat(), "title": "Предложение принято",
         "text": "Клиент принял условия. Сформированы кредитный договор и график платежей."}
    ]
    await db.commit()
    await db.refresh(app_obj)
    return {"application": _app_to_dict(app_obj), "signCode": app_obj.sign_code}


@app.post("/api/applications/{app_id}/sign")
async def sign_documents(app_id: int, code: str = Query(...), db: AsyncSession = Depends(get_db)):
    app_obj = await db.get(Application, app_id)
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")
    if code.strip() != app_obj.sign_code:
        raise HTTPException(status_code=400, detail="Код подтверждения не совпадает")
    app_obj.status = "signed"
    app_obj.signed_at = datetime.utcnow()
    app_obj.history = (app_obj.history or []) + [
        {"at": app_obj.signed_at.isoformat(), "title": "Документы подписаны",
         "text": "Кредитный договор и график платежей подписаны кодом подтверждения."}
    ]
    await db.commit()
    await db.refresh(app_obj)
    return _app_to_dict(app_obj)


@app.post("/api/applications/{app_id}/disburse")
async def disburse(app_id: int, db: AsyncSession = Depends(get_db)):
    app_obj = await db.get(Application, app_id)
    if not app_obj:
        raise HTTPException(status_code=404, detail="Application not found")
    now = datetime.utcnow()
    first_payment = now.replace(day=28) + timedelta(days=30)
    app_obj.status = "issued"
    app_obj.issued_at = now
    app_obj.first_payment_date = first_payment.strftime("%d.%m.%Y")
    app_obj.history = (app_obj.history or []) + [
        {"at": now.isoformat(), "title": "Деньги перечислены",
         "text": f"{int(app_obj.amount):,} ₽ зачислены на счёт {app_obj.account}."}
    ]
    await db.commit()
    await db.refresh(app_obj)
    return _app_to_dict(app_obj)