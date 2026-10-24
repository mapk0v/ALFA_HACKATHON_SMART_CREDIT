from mocks import mock_external_check


def evaluate_credit(amount: float, term: int, client_id: str) -> dict:
    """Детерминированная логика кредитного решения."""
    checks = mock_external_check(client_id)

    max_amount_by_revenue = checks["fns_revenue_avg"] * 6
    risk_premium = 0.0
    if checks["bki_delinquencies"] > 0:
        risk_premium += 3.0
    if checks["bki_score"] < 650:
        risk_premium += 2.0

    base_rate = 16.0
    final_rate = base_rate + risk_premium

    if amount > max_amount_by_revenue:
        approved_amount = max_amount_by_revenue
        decision = "counter_offer"
        reason = f"Запрошенная сумма превышает лимит по выручке. Одобрено {approved_amount:,.0f} ₽."
    elif checks["bki_delinquencies"] > 2:
        decision = "declined"
        approved_amount = 0
        reason = "Критическое количество просрочек в БКИ."
    else:
        decision = "approved"
        approved_amount = amount
        reason = "Параметры заявки соответствуют риск-аппетиту банка."

    monthly_rate = final_rate / 100 / 12
    payment = (
        approved_amount * (monthly_rate * (1 + monthly_rate) ** term)
        / ((1 + monthly_rate) ** term - 1)
        if approved_amount > 0
        else 0
    )

    # Упрощённая балльная оценка для CRM банка
    load = (payment * 12) / max(checks["fns_revenue_avg"] * 12, 1)
    factors = [
        {"name": "Долговая нагрузка", "value": max(0, min(100, round(100 - load * 220))),
         "comment": f"Платёж {round(load * 100)}% годового оборота"},
        {"name": "Стабильность оборота", "value": 78, "comment": "Поступления без провалов 14 месяцев"},
        {"name": "Платёжная дисциплина", "value": 86, "comment": "Просрочек по действующим обязательствам нет"},
        {"name": "Возраст бизнеса", "value": 64, "comment": "Компания работает 4+ года"},
    ]
    score = round(sum(f["value"] for f in factors) / len(factors))

    return {
        "decision": decision,
        "approved_amount": round(approved_amount, 2),
        "rate": round(final_rate, 2),
        "payment": round(payment, 2),
        "reason": reason,
        "bki_score": checks["bki_score"],
        "score": score,
        "factors": factors,
    }