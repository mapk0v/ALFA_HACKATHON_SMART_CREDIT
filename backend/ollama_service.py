import httpx
import logging
import re
import json
import os

logger = logging.getLogger(__name__)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_URL = f"{OLLAMA_BASE_URL}/api/generate"
MODEL = "qwen3:1.7b"#"qwen2.5:3b" # Легкая модель, работает даже на CPU

class OllamaService:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=15.0)

    async def generate_news(self, profile: dict) -> list:
        """Генерирует персонализированную новостную ленту (прямое требование ТЗ стр. 7)."""
        prompt = f"""Ты — банковский аналитик. Подбери 3 новости/предложения для предпринимателя.
Профиль: Сфера: {profile.get('industry')}, ОКВЭД: {profile.get('okved')}, Потребность: {profile.get('need')}.
Верни СТРОГО JSON-массив без markdown:
[{{"title": "Заголовок", "summary": "Описание в 1-2 предложения", "relevance": "Почему это важно клиенту"}}]"""
        
        try:
            resp = await self.client.post(OLLAMA_URL, json={
                "model": MODEL, "prompt": prompt, "stream": False, "options": {"temperature": 0.7, "num_predict": 500}
            })
            text = resp.json().get("response", "[]")
            match = re.search(r'\[.*\]', text, re.DOTALL)
            return json.loads(match.group(0)) if match else self._fallback_news(profile)
        except Exception as e:
            logger.error(f"Ollama news error: {e}")
            return self._fallback_news(profile)

    def _fallback_news(self, profile: dict) -> list:
        """Graceful fallback, если LLM недоступна (Enterprise-требование)."""
        return [
            {"title": "Льготное кредитование МСП", "summary": "Сниженные ставки на оборотные средства.", "relevance": f"Актуально для: {profile.get('industry', 'бизнеса')}"},
            {"title": "Гранты для предпринимателей", "summary": "Обзор федеральных программ поддержки.", "relevance": "Дополнительные источники финансирования"}
        ]

    async def extract_entities(self, text: str) -> dict:
        """Использует LLM только для NLU (извлечение суммы и срока из текста)."""
        prompt = f"""Извлеки сумму кредита (в рублях, числом) и срок (в месяцах, числом) из текста.
    Если не указано, верни null. Верни СТРОГО JSON без markdown:
    {{"amount": number|null, "term": number|null}}

    Примеры:
    - "Хочу купить оборудование за 6 млн" → {{"amount": 6000000, "term": null}}
    - "Нужно 500 тысяч на 12 месяцев" → {{"amount": 500000, "term": 12}}
    - "Кредит на 24 месяца" → {{"amount": null, "term": 24}}

    Текст: "{text}"

    Ответ:"""
    
        try:
            resp = await self.client.post(
                OLLAMA_URL,
                json={
                    "model": MODEL,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.1, "num_predict": 100},
                },
            )
            text_resp = resp.json().get("response", "{}")

            # Ищем JSON в ответе (может быть обёрнут в markdown)
            match = re.search(r'\{[^{}]*"amount"[^{}]*\}', text_resp, re.DOTALL)
            if match:
                return json.loads(match.group(0))

            # Fallback: пробуем извлечь числа регулярками
            amount_match = re.search(r'(\d+)\s*(млн|million)', text.lower())
            if amount_match:
                amount = int(amount_match.group(1)) * 1_000_000
            else:
                amount_match = re.search(r'(\d+)\s*(тыс|thousand)', text.lower())
                if amount_match:
                    amount = int(amount_match.group(1)) * 1_000
                else:
                    amount_match = re.search(r'(\d{5,9})', text.replace(' ', ''))
                    amount = int(amount_match.group(1)) if amount_match else None

            term_match = re.search(r'(\d{1,2})\s*(мес|month)', text.lower())
            term = int(term_match.group(1)) if term_match else None

            return {"amount": amount, "term": term}

        except Exception as e:
            logger.error(f"Ollama extract_entities error: {e}")
            return {}

ollama_service = OllamaService()