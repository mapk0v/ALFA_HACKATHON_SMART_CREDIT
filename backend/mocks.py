CLIENTS = {
    "client_001": {
        "id": "client_001",
        "name": "ИП Иванов А.С.",
        "inn": "504812773901",
        "phone": "+7 999 123-45-67",
        "industry": "Сельское хозяйство",
        "okved": "01.11 Выращивание зерновых культур",
        "company_size": "Микропредприятие",
        "need": "Пополнение оборотных средств",
        "seasonality": "Высокая (осень)",
        "age": "4 года 2 месяца",
        "revenue": 24_000_000,
        "account": "40702810• • • •4417",
        "pre_approved_limit": 3_000_000,
    },
    "client_002": {
        "id": "client_002",
        "name": "ООО 'ТехноСофт'",
        "inn": "7714203391",
        "phone": "+7 999 765-43-21",
        "industry": "IT-разработка",
        "okved": "62.01 Разработка компьютерного ПО",
        "company_size": "Малое предприятие",
        "need": "Покупка оборудования",
        "seasonality": "Нет",
        "age": "6 лет",
        "revenue": 60_000_000,
        "account": "40702810• • • •8831",
        "pre_approved_limit": 8_000_000,
    },
}


def mock_external_check(client_id: str) -> dict:
    if client_id == "client_001":
        return {
            "bki_score": 750,
            "bki_delinquencies": 0,
            "egrul_status": "active",
            "fns_revenue_avg": 5_000_000,
        }
    return {
        "bki_score": 600,
        "bki_delinquencies": 1,
        "egrul_status": "active",
        "fns_revenue_avg": 2_000_000,
    }