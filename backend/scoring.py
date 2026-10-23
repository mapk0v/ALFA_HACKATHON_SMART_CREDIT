from mocks import mock_external_check

def evaluate_credit(amount: float, term: int, client_id: str) -> dict:
    """
    Упрощенная, но прозрачная логика кредитного решения (ТЗ стр. 14).
    Возвращает решение, одобренную сумму, ставку и причину.
    """
    checks = mock_external_check(client_id)
    
    # Базовые правила
    max_amount_by_revenue = checks["fns_revenue_avg"] * 6 # До 6 месячных выручек
    risk_premium = 0.0
    
    if checks["bki_delinquencies"] > 0:
        risk_premium += 3.0 # +3% к ставке за просрочки
    if checks["bki_score"] < 650:
        risk_premium += 2.0
        
    base_rate = 16.0
    final_rate = base_rate + risk_premium
    
    # Логика решения
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

    # Расчет аннуитетного платежа
    monthly_rate = final_rate / 100 / 12
    payment = approved_amount * (monthly_rate * (1 + monthly_rate)**term) / ((1 + monthly_rate)**term - 1) if approved_amount > 0 else 0

    return {
        "decision": decision,
        "approved_amount": round(approached_amount, 2),
        "rate": round(final_rate, 2),
        "payment": round(payment, 2),
        "reason": reason,
        "bki_score": checks["bki_score"]
    }