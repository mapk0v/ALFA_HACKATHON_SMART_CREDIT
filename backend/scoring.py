from mocks import mock_external_check


def evaluate_credit(amount: float, term: int, client_id: str) -> dict:
    """Предварительная риск-оценка. Финальное решение остаётся за специалистом."""
    checks = mock_external_check(client_id)
    risk_premium = (3.0 if checks["bki_delinquencies"] > 0 else 0.0)
    if checks["bki_score"] < 650:
        risk_premium += 2.0
    final_rate = 16.0 + risk_premium

    max_amount_by_revenue = checks["fns_revenue_avg"] * 6
    if checks["bki_delinquencies"] > 2:
        recommendation = "declined"
        recommended_amount = 0
        reason = "Скоринг выявил повышенный риск из-за количества просрочек в БКИ. Требуется проверка специалиста."
    elif amount > max_amount_by_revenue:
        recommendation = "counter_offer"
        recommended_amount = max_amount_by_revenue
        reason = f"Сумма превышает предварительный лимит по выручке. Рекомендуемая сумма — {int(recommended_amount):,} ₽; требуется решение специалиста."
    else:
        recommendation = "review"
        recommended_amount = amount
        reason = "Параметры прошли предварительную автоматическую проверку. Это не является одобрением кредита."

    monthly_rate = final_rate / 100 / 12
    payment = (
        recommended_amount * (monthly_rate * (1 + monthly_rate) ** term)
        / ((1 + monthly_rate) ** term - 1)
        if recommended_amount > 0 and term > 0 else 0
    )
    load = payment / max(checks["fns_revenue_avg"], 1)
    factors = [
        {"name": "Платёжная дисциплина", "value": max(0, min(100, checks["bki_score"] // 10)), "comment": f"Балл БКИ: {checks['bki_score']}"},
        {"name": "Долговая нагрузка", "value": max(0, min(100, round(100 - load * 100))), "comment": "Предварительная оценка ежемесячного платежа относительно среднемесячной выручки"},
        {"name": "Статус бизнеса", "value": 90 if checks.get("egrul_status") == "active" else 20, "comment": "Проверка статуса компании по тестовым данным"},
        {"name": "Просрочки в БКИ", "value": max(0, 100 - checks["bki_delinquencies"] * 25), "comment": f"Количество просрочек: {checks['bki_delinquencies']}"},
    ]
    score = round(sum(item["value"] for item in factors) / len(factors))
    return {
        "decision": recommendation,
        "approved_amount": round(recommended_amount, 2),
        "rate": round(final_rate, 2),
        "payment": round(payment, 2),
        "reason": reason,
        "bki_score": checks["bki_score"],
        "score": score,
        "factors": factors,
    }
