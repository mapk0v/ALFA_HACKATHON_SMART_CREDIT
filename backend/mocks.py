CLIENTS = {
    "client_001": {
        "id": "client_001",
        "name": "ИП Иванов А.С.",
        "industry": "Сельское хозяйство",
        "okved": "01.11 Выращивание зерновых культур",
        "company_size": "Микропредприятие",
        "need": "Пополнение оборотных средств",
        "seasonality": "Высокая (осень)"
    },
    "client_002": {
        "id": "client_002",
        "name": "ООО 'ТехноСофт'",
        "industry": "IT-разработка",
        "okved": "62.01 Разработка компьютерного ПО",
        "company_size": "Малое предприятие",
        "need": "Покупка оборудования",
        "seasonality": "Нет"
    }
}

# Мок внешних проверок (БКИ, ЕГРЮЛ, ФНС)
def mock_external_check(client_id: str) -> dict:
    if client_id == "client_001":
        return {
            "bki_score": 750, # Хорошая кредитная история
            "bki_delinquencies": 0,
            "egrul_status": "active",
            "fns_revenue_avg": 5_000_000 # Среднемесячная выручка
        }
    return {
        "bki_score": 600,
        "bki_delinquencies": 1,
        "egrul_status": "active",
        "fns_revenue_avg": 2_000_000
    }