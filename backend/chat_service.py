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
            reply="Здравствуйте! Подскажите, какую сумму вы планируете привлечь и на какой срок (в месяцах)?",
            context={},
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
            reply=(
                f"Предварительная оценка выявила повышенный риск по запросу на {int(amount):,} ₽. "
                f"Это не является официальным отказом: окончательное решение возможно только после подачи заявки "
                f"и проверки кредитным специалистом. Причина предварительного сигнала: {decision['reason']}"
            ),
            context={"amount": amount, "term": term},
            offer=None
        )

    # 5. Подбор продукта по правилам витрины (синхронно с pickProduct на фронте)
    if amount <= 1_000_000 and term <= 12:
        product_id = "micro"
        product_name = "Микрозайм"
        rate = 22.0
    elif amount > 5_000_000 or term > 24:
        product_id = "development"
        product_name = "Кредит на развитие"
        rate = 15.9
    else:
        product_id = "working"
        product_name = "Оборотный кредит"
        rate = 18.5

    # Формируем предложение (approved или counter_offer)
    return ChatResponse(
        reply=(
            f"Рекомендую «{product_name}» под {decision['rate']}% годовых. "
            f"Платёж — около {int(decision['payment']):,} ₽ в месяц. "
            f"{decision['reason']}"
        ),
        context={"amount": amount, "term": term, "productId": product_id},
        offer=ChatOffer(
            productId=product_id,  # ← теперь это working / development / micro
            productName=product_name,
            rate=decision["rate"],
            amount=decision["approved_amount"],
            term=term,
            payment=decision["payment"],
            why=decision["reason"]
        )
    )