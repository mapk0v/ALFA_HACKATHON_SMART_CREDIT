import asyncio
import logging
from ollama_service import OllamaService

# Настраиваем логи, чтобы видеть всё, что происходит
logging.basicConfig(level=logging.INFO)

async def main():
    service = OllamaService()
    test_text = "Хочу купить оборудование за 6 млн"
    
    print(f"\n Отправляем текст: '{test_text}'\n")
    
    # Вызываем метод напрямую
    result = await service.extract_entities(test_text)
    
    print(f"\n✅ Итоговый результат для бэкенда: {result}\n")

if __name__ == "__main__":
    asyncio.run(main())