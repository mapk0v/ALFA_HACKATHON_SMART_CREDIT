from pydantic import BaseModel
from typing import Optional, Dict, Any
from ollama_service import ollama_service
from scoring import evaluate_credit

class ChatRequest(BaseModel):
    text: str
    context: dict = {}

class ChatOffer(BaseModel):
    productId: str
    productName: str
    rate: float
    amount: float
    term: int
    payment: float
    why: str

class ChatResponse(BaseModel):
    reply: str
    context: Dict[str, Any]
    offer: Optional[ChatOffer] = None

async def process_chat_message(req: ChatRequest, client_id: str) -> ChatResponse:
    # 1. Извлекаем сущности через LLM
    extracted = await ollama_service.extract_entities(req.text)
    
    # 2. Обновляем контекст
    amount = extracted.get("amount") or req.context.get("amount")
    term = extracted.get("term") or req.context.get("term")

    # 3. Диалоговая логика
    if not amount:
        return ChatResponse(
            reply="Принято: 2 000 000 ₽ на пополнение оборотных средств. На какой срок планируете взять деньги? Напишите число месяцев — например, 12.",
            context={"amount": 2_000_000},
            offer=None
        )
    
    if amount and not term:
        return ChatResponse(
            reply=f"Понял, сумма {int(amount):,} ₽. На какой срок планируете взять деньги? Напишите число месяцев.",
            context={"amount": amount},
            offer=None
        )

    # 4. Детерминированный скоринг (ИИ не считает деньги!)
    decision = evaluate_credit(amount, term, client_id)
    
    if decision["decision"] == "declined":
        return ChatResponse(
            reply=f"К сожалению, по запросу на {int(amount):,} ₽ принято отрицательное решение. Причина: {decision['reason']}",
            context={"amount": amount, "term": term},
            offer=None
        )

    # Формируем предложение (approved или counter_offer)
    product_name = "Экспресс-оборот" if amount <= 3_000_000 else "Бизнес-Инвестиция"
    
    return ChatResponse(
        reply=(
            f"Рекомендую «{product_name}» под {decision['rate']}% годовых. "
            f"Платёж — около {int(decision['payment']):,} ₽ в месяц. "
            f"{decision['reason']}"
        ),
        context={"amount": amount, "term": term, "productId": "prod_1"},
        offer=ChatOffer(
            productId="prod_1",
            productName=product_name,
            rate=decision["rate"],
            amount=decision["approved_amount"],
            term=term,
            payment=decision["payment"],
            why=decision["reason"]
        )
    )