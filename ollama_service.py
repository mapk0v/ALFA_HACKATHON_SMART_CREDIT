import httpx
import logging
import re
import json

logger = logging.getLogger(__name__)
OLLAMA_URL = "http://ollama:11434/api/generate"
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
Если не указано, верни null. Верни СТРОГО JSON: {{"amount": number|null, "term": number|null}}
Текст: "{text}" """
        try:
            resp = await self.client.post(OLLAMA_URL, json={
                "model": MODEL, "prompt": prompt, "stream": False, "options": {"temperature": 0.1, "num_predict": 100}
            })
            text_resp = resp.json().get("response", "{}")
            match = re.search(r'\{.*\}', text_resp, re.DOTALL)
            return json.loads(match.group(0)) if match else {}
        except Exception:
            return {}

ollama_service = OllamaService()