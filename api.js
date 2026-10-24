/* ============================================================
   api.js — слой интеграции с бэкендом FastAPI.
   Все функции делают реальные HTTP-запросы. Контракты
   синхронизированы с main.py.
============================================================ */
const API_BASE_URL = 'http://localhost:8000/api';
const CURRENT_CLIENT = 'client_001';

const LLM_PROFILE = {
    api: 'openai-compatible',
    weights: 'open',
    endpoint: API_BASE_URL + '/chat',
};

/* ============================================================
   Справочники (локальные — идентичны витрине продуктов банка)
============================================================ */
const PRODUCTS = {
    working: {
        id: 'working', name: 'Оборотный кредит', rate: 18.5,
        minAmount: 300000, maxAmount: 5000000, minTerm: 3, maxTerm: 24,
        image: 'assets/prod-working.png', pledge: 'без залога',
        features: ['до 5 000 000 ₽', '3–24 месяца', 'без залога', 'деньги в день решения'],
        purpose: 'Закупка товара, кассовые разрывы, расчёты с поставщиками',
        defaultPurpose: 'Закупка товара на сезон',
    },
    development: {
        id: 'development', name: 'Кредит на развитие', rate: 15.9,
        minAmount: 1000000, maxAmount: 15000000, minTerm: 12, maxTerm: 60,
        image: 'assets/prod-development.png', pledge: 'с залогом',
        features: ['до 15 000 000 ₽', '12–60 месяцев', 'залог: оборудование или недвижимость', 'ставка ниже на 2,6 п.п.'],
        purpose: 'Оборудование, новая точка, долгосрочные вложения',
        defaultPurpose: 'Покупка оборудования для новой точки',
    },
    micro: {
        id: 'micro', name: 'Микрозайм', rate: 22.0,
        minAmount: 50000, maxAmount: 1000000, minTerm: 1, maxTerm: 12,
        image: 'assets/prod-micro.png', pledge: 'без залога',
        features: ['до 1 000 000 ₽', '1–12 месяцев', 'решение за 2 минуты', 'минимум документов'],
        purpose: 'Небольшая сумма на короткий срок',
        defaultPurpose: 'Покрытие кассового разрыва',
    },
};

const APP_STATUS = {
    DRAFT: 'draft', SCORING: 'scoring', APPROVED: 'approved',
    COUNTER: 'counter', REJECTED: 'rejected', SIGNING: 'signing',
    SIGNED: 'signed', ISSUED: 'issued',
};
const STATUS_LABEL = {
    draft: 'Черновик', scoring: 'На скоринге', approved: 'Одобрено',
    counter: 'Одобрено на иных условиях', rejected: 'Отказ',
    signing: 'Подписание', signed: 'Документы подписаны', issued: 'Кредит выдан',
};
const FINAL_STATUSES = [APP_STATUS.REJECTED, APP_STATUS.SIGNING, APP_STATUS.SIGNED, APP_STATUS.ISSUED];

/* ============================================================
   Универсальный fetch-обёртка
============================================================ */
async function apiRequest(path, { method = 'GET', body = null, query = {} } = {}) {
    const url = new URL(API_BASE_URL + path, window.location.origin);
    Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.append(k, v);
    });
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    const res = await fetch(url.toString(), opts);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
}

/* ============================================================
   API-методы
============================================================ */

// POST /api/auth/login
async function apiLogin(phone, name, company) {
    return apiRequest('/auth/login', {
        method: 'POST',
        query: { phone, name, company: company || '' },
    });
}

// POST /api/chat
async function apiSendChatMessage(text, history, context = {}) {
    return apiRequest('/chat', {
        method: 'POST',
        query: { client_id: CURRENT_CLIENT },
        body: { text, context }, // ← ПЕРЕДАЁМ КОНТЕКСТ НА БЭКЕНД
    });
}

// POST /api/applications
async function apiCreateApplication(data) {
    return apiRequest('/applications', {
        method: 'POST',
        query: {
            amount: data.amount,
            term: data.term,
            client_id: CURRENT_CLIENT,
            product_id: data.productId,
            product_name: data.productName,
            purpose: data.purpose || '',
        },
    });
}

// GET /api/applications
async function apiGetApplications() {
    return apiRequest('/applications', {
        method: 'GET',
        query: { client_id: CURRENT_CLIENT },
    });
}

// PATCH /api/applications/{id}/decision
async function apiBankDecision(id, status, comment) {
    return apiRequest(`/applications/${id}/decision`, {
        method: 'PATCH',
        query: { status, comment: comment || '' },
    });
}

// POST /api/applications/{id}/offer/accept
async function apiAcceptOffer(id) {
    return apiRequest(`/applications/${id}/offer/accept`, { method: 'POST' });
}

// POST /api/applications/{id}/sign
async function apiSignDocuments(id, code) {
    return apiRequest(`/applications/${id}/sign`, {
        method: 'POST',
        query: { code },
    });
}

// POST /api/applications/{id}/disburse
async function apiDisburse(id) {
    return apiRequest(`/applications/${id}/disburse`, { method: 'POST' });
}

// POST /api/clients/{id}/news
async function apiGetNews(clientId = CURRENT_CLIENT) {
    return apiRequest(`/clients/${clientId}/news`, { method: 'POST' });
}

/* ============================================================
   Вспомогательные функции (остались без изменений)
============================================================ */
function formatMoney(value) {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return new Intl.NumberFormat('ru-RU').format(Math.round(value)) + ' ₽';
}
function formatTime(iso) {
    const date = iso ? new Date(iso) : new Date();
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
function parseAmount(text) {
    if (!text) return null;
    const normalized = text.toLowerCase().replace(/\s/g, '');
    const millions = normalized.match(/(\d+[.,]?\d+)(млн|миллион)/);
    if (millions) return Math.round(parseFloat(millions[1].replace(',', '.')) * 1_000_000);
    const thousands = normalized.match(/(\d+[.,]?\d*)(тыс|т.р)/);
    if (thousands) return Math.round(parseFloat(thousands[1].replace(',', '.')) * 1_000);
    const plain = normalized.match(/(\d{5,9})/);
    return plain ? parseInt(plain[1], 10) : null;
}
function parseTerm(text) {
    if (!text) return null;
    const months = text.toLowerCase().match(/(\d{1,2})\s(мес|month)/);
    if (months) return parseInt(months[1], 10);
    const years = text.toLowerCase().match(/(\d{1,2})\s*(год|года|лет)/);
    if (years) return parseInt(years[1], 10) * 12;
    const bare = text.trim().match(/^(\d{1,2})$/);
    return bare ? parseInt(bare[1], 10) : null;
}
function pickProduct(amount, term) {
    if (amount <= PRODUCTS.micro.maxAmount && term <= PRODUCTS.micro.maxTerm) return PRODUCTS.micro;
    if (amount > PRODUCTS.working.maxAmount || term > PRODUCTS.working.maxTerm) return PRODUCTS.development;
    return PRODUCTS.working;
}