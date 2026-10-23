/* ============================================================
   api.js — слой интеграции с бэкендом.
   Сейчас здесь моки: данные живут в памяти вкладки, сеть имитируется
   через setTimeout. Каждая функция повторяет контракт будущего
   FastAPI-эндпоинта: те же аргументы, тот же ответ.

   Чтобы подключить реальный бэкенд, замените тело функции на fetch —
   остальной код (app.js) менять не нужно.
   ============================================================ */

/* Базовый адрес бэкенда. Для локальной разработки — FastAPI на 8000 порту. */
const API_BASE_URL = 'http://localhost:8000/api';

/*
  Конфигурация ИИ-ассистента. Запросы идёт через бэкенд, фронтенд знает только
  адрес своего API. На стороне сервера используется модель с открытыми весами и
  OpenAI-совместимый интерфейс, поэтому провайдера можно поменять одной переменной
  окружения (LLM_BASE_URL / LLM_MODEL), не трогая клиент.
*/
const LLM_PROFILE = { api: 'openai-compatible', weights: 'open', endpoint: API_BASE_URL + '/chat' };

/* Имитация сетевой задержки */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ============================================================
   Справочники
   ============================================================ */

const PRODUCTS = {
  working: {
    id: 'working',
    name: 'Оборотный кредит',
    rate: 18.5,
    minAmount: 300000,
    maxAmount: 5000000,
    minTerm: 3,
    maxTerm: 24,
    image: 'assets/prod-working.png',
    pledge: 'без залога',
    features: ['до 5 000 000 ₽', '3–24 месяца', 'без залога', 'деньги в день решения'],
    purpose: 'Закупка товара, кассовые разрывы, расчёты с поставщиками',
    defaultPurpose: 'Закупка товара на сезон'
  },
  development: {
    id: 'development',
    name: 'Кредит на развитие',
    rate: 15.9,
    minAmount: 1000000,
    maxAmount: 15000000,
    minTerm: 12,
    maxTerm: 60,
    image: 'assets/prod-development.png',
    pledge: 'с залогом',
    features: ['до 15 000 000 ₽', '12–60 месяцев', 'залог: оборудование или недвижимость', 'ставка ниже на 2,6 п.п.'],
    purpose: 'Оборудование, новая точка, долгосрочные вложения',
    defaultPurpose: 'Покупка оборудования для новой точки'
  },
  micro: {
    id: 'micro',
    name: 'Микрозайм',
    rate: 22.0,
    minAmount: 50000,
    maxAmount: 1000000,
    minTerm: 1,
    maxTerm: 12,
    image: 'assets/prod-micro.png',
    pledge: 'без залога',
    features: ['до 1 000 000 ₽', '1–12 месяцев', 'решение за 2 минуты', 'минимум документов'],
    purpose: 'Небольшая сумма на короткий срок',
    defaultPurpose: 'Покрытие кассового разрыва'
  }
};

/* Статусы заявки = состояния кредитного конвейера */
const APP_STATUS = {
  DRAFT: 'draft',
  SCORING: 'scoring',
  APPROVED: 'approved',
  COUNTER: 'counter',
  REJECTED: 'rejected',
  SIGNING: 'signing',
  SIGNED: 'signed',
  ISSUED: 'issued'
};

const STATUS_LABEL = {
  draft: 'Черновик',
  scoring: 'На скоринге',
  approved: 'Одобрено',
  counter: 'Одобрено на иных условиях',
  rejected: 'Отказ',
  signing: 'Подписание',
  signed: 'Документы подписаны',
  issued: 'Кредит выдан'
};

/* Этапы, на которых заявка уже закрыта для решения банка */
const FINAL_STATUSES = [APP_STATUS.REJECTED, APP_STATUS.SIGNING, APP_STATUS.SIGNED, APP_STATUS.ISSUED];

/* ============================================================
   Хранилище-заглушка (вместо БД на стороне бэкенда)
   ============================================================ */

const STORE = {
  nextId: 1026,
  /* Синтетические заявки других клиентов — чтобы CRM банка была наполненной */
  applications: [
    {
      id: 1024,
      companyName: 'ООО «Северный склад»',
      inn: '7714203391',
      productId: 'development',
      productName: 'Кредит на развитие',
      rate: 15.9,
      amount: 6500000,
      term: 36,
      purpose: 'Покупка складского оборудования',
      payment: 228_000,
      account: '40702810• • • •8831',
      signCode: '4417',
      status: APP_STATUS.SCORING,
      score: 71,
      factors: [],
      decisionComment: '',
      createdAt: '2026-10-20T09:12:00',
      history: [{ at: '2026-10-20T09:12:00', title: 'Заявка создана', text: 'Клиент отправил заявку через кабинет' }]
    },
    {
      id: 1025,
      companyName: 'ИП Глебова А. С.',
      inn: '504812773901',
      productId: 'micro',
      productName: 'Микрозайм',
      rate: 22.0,
      amount: 450000,
      term: 6,
      purpose: 'Пополнение оборотных средств',
      payment: 79_900,
      account: '40802810• • • •2290',
      signCode: '7731',
      status: APP_STATUS.APPROVED,
      score: 84,
      factors: [],
      decisionComment: 'Одобрено автоматически: низкая долговая нагрузка, оборот стабилен 14 месяцев.',
      createdAt: '2026-10-19T16:40:00',
      history: [
        { at: '2026-10-19T16:40:00', title: 'Заявка создана', text: 'Клиент отправил заявку через кабинет' },
        { at: '2026-10-19T16:43:00', title: 'Решение принято', text: 'Одобрено на запрошенных условиях' }
      ]
    }
  ]
};

/* ============================================================
   Расчёты (на проде считает бэкенд, здесь — для живого калькулятора)
   ============================================================ */

/* Аннуитетный платёж */
function calcPayment(amount, term, rate) {
  const monthly = rate / 100 / 12;
  if (!amount || !term) return 0;
  if (monthly === 0) return amount / term;
  return (amount * monthly) / (1 - Math.pow(1 + monthly, -term));
}

/*
  Скоринговая оценка — упрощённая балльная модель.
  Важно: скоринг даёт только уровень риска, решение принимает банк
  (сотрудник в CRM или автоправило).
*/
function calcScore(application, company) {
  const revenue = (company && company.revenue) || 24_000_000;
  const product = PRODUCTS[application.productId];
  const payment = calcPayment(application.amount, application.term, product.rate);
  const load = (payment * 12) / revenue; // доля годового оборота на обслуживание долга

  const factors = [
    {
      name: 'Долговая нагрузка',
      value: Math.max(0, Math.min(100, Math.round(100 - load * 220))),
      comment: `Платёж ${Math.round((load * 100))}% годового оборота`
    },
    { name: 'Стабильность оборота', value: 78, comment: 'Поступления без провалов 14 месяцев' },
    { name: 'Платёжная дисциплина', value: 86, comment: 'Просрочек по действующим обязательствам нет' },
    { name: 'Возраст бизнеса', value: 64, comment: 'Компания работает 4 года 2 месяца' }
  ];

  const score = Math.round(factors.reduce((sum, f) => sum + f.value, 0) / factors.length);
  return { score, factors };
}

/* ============================================================
   API
   ============================================================ */

// TODO: ИНТЕГРАЦИЯ. Замени этот мок на fetch к FastAPI: POST /api/auth/login
async function apiLogin(phone, name, company) {
  await delay(600);

  if (!phone || !name) {
    throw new Error('Телефон и имя обязательны');
  }

  /* Данные компании банк подтягивает из ЕГРЮЛ/ЕГРИП по ИНН телефона клиента */
  return {
    token: 'demo-jwt-token',
    user: { name, phone, role: 'client' },
    company: {
      name: company || 'ООО «Ромашка»',
      inn: '7701234567',
      okved: '47.11 — Розничная торговля',
      age: '4 года 2 месяца',
      revenue: 24_000_000,
      employees: 12,
      accountTurnover: 2_150_000,
      preApprovedLimit: 3_000_000,
      account: '40702810• • • •4417'
    }
  };
}

// TODO: ИНТЕГРАЦИЯ. Замени этот мок на fetch к FastAPI: POST /api/chat
async function apiSendChatMessage(text, history) {
  await delay(900);

  const botTurns = (history || []).filter((m) => m.role === 'bot').length;
  const amount = parseAmount(text);
  const term = parseTerm(text);

  /* Шаг 1: клиент описал потребность — уточняем срок */
  if (botTurns <= 1) {
    return {
      reply:
        `Принято: ${amount ? formatMoney(amount) : 'сумму'} на пополнение оборотных средств. ` +
        'На какой срок планируете взять деньги? Напишите число месяцев — например, 12.',
      context: { amount: amount || 2_000_000 },
      offer: null
    };
  }

  /* Шаг 2: клиент назвал срок — отдаём рекомендацию продукта */
  const chosenTerm = term || 12;
  const chosenAmount = amount || lastAmount(history) || 2_000_000;
  const product = pickProduct(chosenAmount, chosenTerm);
  const payment = calcPayment(chosenAmount, chosenTerm, product.rate);

  return {
    reply:
      `Рекомендую «${product.name}» под ${product.rate}% годовых, ${product.pledge}. ` +
      `Платёж — около ${formatMoney(payment)} в месяц. ` +
      'Условия предварительные, итоговые банк подтвердит после скоринга.',
    context: { amount: chosenAmount, term: chosenTerm, productId: product.id },
    offer: {
      productId: product.id,
      productName: product.name,
      rate: product.rate,
      amount: chosenAmount,
      term: chosenTerm,
      payment,
      why: `Сумма ${formatMoney(chosenAmount)} и срок ${chosenTerm} мес. попадают в условия продукта, залог не требуется.`
    }
  };
}

// TODO: ИНТЕГРАЦИЯ. Замени этот мок на fetch к FastAPI: POST /api/applications
async function apiCreateApplication(data) {
  await delay(1100);

  const product = PRODUCTS[data.productId];
  const payment = calcPayment(data.amount, data.term, product.rate);
  const { score, factors } = calcScore(data, data.company);
  const now = new Date().toISOString().slice(0, 19);

  const application = {
    id: STORE.nextId++,
    companyName: (data.company && data.company.name) || 'ООО «Ромашка»',
    inn: (data.company && data.company.inn) || '7701234567',
    productId: product.id,
    productName: product.name,
    rate: product.rate,
    amount: data.amount,
    term: data.term,
    purpose: data.purpose,
    documents: data.documents || [],
    payment,
    status: APP_STATUS.SCORING,
    score,
    factors,
    decisionComment: '',
    /* Код подтверждения подписания моделируется внутри продукта: внешних SMS нет */
    signCode: String(1000 + Math.floor(Math.random() * 9000)),
    account: (data.company && data.company.account) || '40702810• • • •4417',
    createdAt: now,
    history: [
      { at: now, title: 'Заявка создана', text: 'Данные приняты, проверка полноты пройдена' },
      { at: now, title: 'Скоринг выполнен', text: `Балл ${score} из 100. Решение принимает кредитный специалист.` }
    ]
  };

  STORE.applications.unshift(application);
  return application;
}

// TODO: ИНТЕГРАЦИЯ. Замени этот мок на fetch к FastAPI: GET /api/applications
async function apiGetApplications() {
  await delay(400);
  return STORE.applications.map((a) => ({ ...a }));
}

// TODO: ИНТЕГРАЦИЯ. Замени этот мок на fetch к FastAPI: PATCH /api/applications/{id}/decision
async function apiBankDecision(id, status, comment) {
  await delay(700);

  const application = STORE.applications.find((a) => a.id === id);
  if (!application) throw new Error('Заявка не найдена');

  const defaults = {
    [APP_STATUS.APPROVED]: 'Одобрено на запрошенных условиях. Оборот стабилен, долговая нагрузка в норме.',
    [APP_STATUS.COUNTER]: 'Одобрено на иных условиях: сумма снижена до 70% от запрошенной из-за текущей долговой нагрузки.',
    [APP_STATUS.REJECTED]: 'Отказ по результатам скоринга: платёж превышает допустимую долю оборота.'
  };

  application.status = status;
  application.decisionComment = comment || defaults[status] || '';

  if (status === APP_STATUS.COUNTER) {
    application.counterOffer = {
      amount: Math.round((application.amount * 0.7) / 50000) * 50000,
      term: application.term + 6,
      rate: application.rate
    };
    application.counterOffer.payment = calcPayment(
      application.counterOffer.amount,
      application.counterOffer.term,
      application.counterOffer.rate
    );
  }

  application.history.push({
    at: new Date().toISOString().slice(0, 19),
    title: 'Решение принято',
    text: application.decisionComment
  });

  return { ...application };
}

// TODO: ИНТЕГРАЦИЯ. Замени этот мок на fetch к FastAPI: POST /api/applications/{id}/offer/accept
async function apiAcceptOffer(id) {
  await delay(600);

  const application = STORE.applications.find((a) => a.id === id);
  if (!application) throw new Error('Заявка не найдена');

  application.status = APP_STATUS.SIGNING;
  application.history.push({
    at: new Date().toISOString().slice(0, 19),
    title: 'Предложение принято',
    text: 'Клиент принял условия. Сформированы кредитный договор и график платежей.'
  });

  /* Код подтверждения в прототипе возвращается прямо в ответе и показывается
     на экране — внешних каналов (SMS, почта, мессенджеры) в сценарии нет. */
  return { application: { ...application }, signCode: application.signCode };
}

// TODO: ИНТЕГРАЦИЯ. Замени этот мок на fetch к FastAPI: POST /api/applications/{id}/sign
async function apiSignDocuments(id, code) {
  await delay(800);

  const application = STORE.applications.find((a) => a.id === id);
  if (!application) throw new Error('Заявка не найдена');
  if (String(code).trim() !== application.signCode) {
    throw new Error('Код подтверждения не совпадает');
  }

  application.status = APP_STATUS.SIGNED;
  application.signedAt = new Date().toISOString().slice(0, 19);
  application.history.push({
    at: application.signedAt,
    title: 'Документы подписаны',
    text: 'Кредитный договор и график платежей подписаны кодом подтверждения.'
  });

  return { ...application };
}

// TODO: ИНТЕГРАЦИЯ. Замени этот мок на fetch к FastAPI: POST /api/applications/{id}/disburse
async function apiDisburse(id) {
  await delay(900);

  const application = STORE.applications.find((a) => a.id === id);
  if (!application) throw new Error('Заявка не найдена');

  const now = new Date();
  const firstPayment = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

  application.status = APP_STATUS.ISSUED;
  application.issuedAt = now.toISOString().slice(0, 19);
  application.firstPaymentDate = firstPayment.toLocaleDateString('ru-RU');
  application.history.push({
    at: application.issuedAt,
    title: 'Деньги перечислены',
    text: `${formatMoney(application.amount)} зачислены на счёт ${application.account}.`
  });

  return { ...application };
}

/* ============================================================
   Вспомогательные функции
   ============================================================ */

function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('ru-RU').format(Math.round(value)) + ' ₽';
}

function formatTime(iso) {
  const date = iso ? new Date(iso) : new Date();
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/* «2 млн», «2000000», «2 000 000 рублей» → 2000000 */
function parseAmount(text) {
  if (!text) return null;
  const normalized = text.toLowerCase().replace(/\s/g, '');
  const millions = normalized.match(/(\d+[.,]?\d*)(млн|миллион)/);
  if (millions) return Math.round(parseFloat(millions[1].replace(',', '.')) * 1_000_000);
  const thousands = normalized.match(/(\d+[.,]?\d*)(тыс|т\.р)/);
  if (thousands) return Math.round(parseFloat(thousands[1].replace(',', '.')) * 1_000);
  const plain = normalized.match(/(\d{5,9})/);
  return plain ? parseInt(plain[1], 10) : null;
}

/* «на 12 месяцев», «12» → 12 */
function parseTerm(text) {
  if (!text) return null;
  const months = text.toLowerCase().match(/(\d{1,2})\s*(мес|month)/);
  if (months) return parseInt(months[1], 10);
  const years = text.toLowerCase().match(/(\d{1,2})\s*(год|года|лет)/);
  if (years) return parseInt(years[1], 10) * 12;
  const bare = text.trim().match(/^(\d{1,2})$/);
  return bare ? parseInt(bare[1], 10) : null;
}

function lastAmount(history) {
  for (let i = (history || []).length - 1; i >= 0; i--) {
    const found = parseAmount(history[i].text);
    if (found) return found;
  }
  return null;
}

/* Подбор продукта по сумме и сроку — упрощённая витрина правил банка */
function pickProduct(amount, term) {
  if (amount <= PRODUCTS.micro.maxAmount && term <= PRODUCTS.micro.maxTerm) return PRODUCTS.micro;
  if (amount > PRODUCTS.working.maxAmount || term > PRODUCTS.working.maxTerm) return PRODUCTS.development;
  return PRODUCTS.working;
}
