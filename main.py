from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from database import init_db, get_db, Application
from mocks import CLIENTS
from ollama_service import ollama_service
from chat_service import process_chat_message, ChatRequest, ChatResponse

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

@app.get("/health")
async def health():
    return {"status": "ok", "service": "backend"}

@app.get("/health/ollama")
async def health_ollama():
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get("http://localhost:11434")
            return {"status": "healthy", "service": "ollama"} if resp.status_code == 200 else {"status": "unhealthy"}
    except Exception:
        return {"status": "unhealthy", "service": "ollama"}

@app.get("/api/clients/{client_id}")
async def get_client(client_id: str):
    if client_id not in CLIENTS:
        raise HTTPException(status_code=404, detail="Client not found")
    return CLIENTS[client_id]

@app.post("/api/clients/{client_id}/news")
async def get_personalized_news(client_id: str):
    """Прямое требование ТЗ: показать, как изменяется новостная лента под клиента."""
    profile = CLIENTS.get(client_id, {})
    news = await ollama_service.generate_news(profile)
    return {"client_id": client_id, "industry": profile.get("industry"), "news": news, "source": "ollama"}

@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, client_id: str = "client_001"):
    """Умный чат-ассистент с извлечением сущностей и детерминированным скорингом."""
    return await process_chat_message(req, client_id)

@app.post("/api/applications")
async def create_application(amount: float, term: int, client_id: str, db: AsyncSession = Depends(get_db)):
    """Создание заявки и запуск скоринга."""
    from scoring import evaluate_credit
    decision = evaluate_credit(amount, term, client_id)
    
    new_app = Application(
        client_id=client_id,
        amount=amount,
        term=term,
        status=decision["decision"],
        decision_data=decision
    )
    db.add(new_app)
    await db.commit()
    await db.refresh(new_app)
    return {"application_id": new_app.id, "status": new_app.status, "decision": decision}