/* ============================================================
   app.js — React-компоненты и логика прототипа.
   JSX компилируется в браузере (Babel Standalone), сборщик не нужен.
   Состояние поднято в корневой компонент App, роли «Клиент» и «Банк»
   работают с одним и тем же набором заявок.
   ============================================================ */

const { useState, useEffect, useRef, useMemo, useCallback } = React;

function calcPayment(amount, term, rate) {
  if (!amount || !term || !rate) return 0;
  const monthlyRate = rate / 100 / 12;
  return amount * (monthlyRate * Math.pow(1 + monthlyRate, term)) / 
         (Math.pow(1 + monthlyRate, term) - 1);
}

function formatMoney(amount) {
  if (!amount) return "0 ₽";
  return Math.round(amount).toLocaleString("ru-RU") + " ₽";
}

function parseAmount(text) {
  const match = String(text).match(/(\d[\d\s]*)\s*(?:млн|тыс|руб|₽|rur)?/i);
  if (!match) return null;
  let num = match[1].replace(/\s/g, "");
  if (String(text).toLowerCase().includes("млн")) num *= 1_000_000;
  if (String(text).toLowerCase().includes("тыс")) num *= 1_000;
  return Number(num);
}

function parseTerm(text) {
  const match = String(text).match(/(\d+)\s*(?:мес|месяц|год)/i);
  return match ? Number(match[1]) : null;
}

function pickProduct(amount, term) {
  if (amount <= 3_000_000 && term <= 24) {
    return { id: "prod_1", name: "Экспресс-оборот", rate: 18.5, pledge: "без залога" };
  }
  if (amount <= 10_000_000) {
    return { id: "prod_2", name: "Бизнес-Инвестиция", rate: 16.0, pledge: "под залог оборудования" };
  }
  return { id: "prod_3", name: "Кредитная линия", rate: 19.0, pledge: "под поручительство" };
}

/* ============================================================
   Мелкие утилиты интерфейса
   ============================================================ */

/* Иконка Lucide. Если библиотека не загрузилась — просто ничего не рисуем. */
function LIcon({ name, size = 18, className = '' }) {
  const host = useRef(null);

  useEffect(() => {
    const el = host.current;
    const lib = window.lucide;
    if (!el || !lib) return;
    el.innerHTML = '';

    const key = name.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    const icon = (lib.icons && lib.icons[key]) || lib[key];
    if (!icon || typeof lib.createElement !== 'function') return;

    const node = lib.createElement(icon);
    node.setAttribute('width', size);
    node.setAttribute('height', size);
    node.setAttribute('stroke-width', '2');
    el.appendChild(node);
  }, [name, size]);

  return <span className={'licon ' + className} ref={host} aria-hidden="true" />;
}

/* Переключатель темы. Выбор запоминается, начальная тема ставится в index.html до отрисовки. */
function ThemeToggle({ theme, onToggle, compact }) {
  const dark = theme === 'dark';
  const label = dark ? 'Светлая тема' : 'Тёмная тема';

  return (
    <button
      className={'theme-toggle' + (compact ? ' theme-toggle--compact' : '')}
      onClick={onToggle}
      title={label}
      aria-label={label}
    >
      <LIcon name={dark ? 'sun' : 'moon'} size={16} />
      {!compact && <span className="theme-toggle__label">{dark ? 'Светлая' : 'Тёмная'}</span>}
    </button>
  );
}

const STATUS_CLASS = {
  draft: 'badge--draft',
  scoring: 'badge--scoring',
  approved: 'badge--approved',
  counter: 'badge--counter',
  rejected: 'badge--rejected',
  signing: 'badge--counter',
  signed: 'badge--approved',
  issued: 'badge--approved'
};

function StatusBadge({ status }) {
  return (
    <span className={'badge ' + (STATUS_CLASS[status] || 'badge--draft')}>
      <span className="badge__dot" />
      {STATUS_LABEL[status] || status}
    </span>
  );
}

/* Иллюстрация пустого состояния.
   Раньше это были PNG со сплошной белой заливкой — на тёмной теме корпус
   сливался с фоном. Векторная версия построена на токенах темы, поэтому
   одинаково читается и в светлой, и в тёмной. */
const SPARK_PATH =
  'M12 0c0 6.63 5.37 12 12 12-6.63 0-12 5.37-12 12 0-6.63-5.37-12-12-12 6.63 0 12-5.37 12-12z';

function EmptyArt({ variant = 'client' }) {
  return (
    <svg className="empty__art" viewBox="0 0 128 104" role="img" aria-hidden="true" focusable="false">
      {variant === 'bank' ? (
        <g>
          {/* задняя стенка лотка */}
          <path
            d="M14 40a8 8 0 0 1 8-8h84a8 8 0 0 1 8 8v44a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8z"
            fill="var(--surface-2)"
            stroke="var(--line)"
            strokeWidth="2"
          />
          {/* документ */}
          <rect x="34" y="20" width="60" height="46" rx="8" fill="var(--red)" />
          <g stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity=".85">
            <path d="M46 34h36M46 43h36M46 52h22" />
          </g>
          {/* передняя стенка лотка */}
          <path
            d="M10 58h108a5 5 0 0 1 4.9 6l-4.3 23a9 9 0 0 1-8.9 7.4H18.3a9 9 0 0 1-8.9-7.4l-4.3-23A5 5 0 0 1 10 58z"
            fill="var(--red-light)"
            stroke="var(--red-line)"
            strokeWidth="2"
          />
        </g>
      ) : (
        <g>
          {/* корпус папки */}
          <path
            d="M6 28a8 8 0 0 1 8-8h30.8a8 8 0 0 1 6.2 3l6 7.3a4 4 0 0 0 3.1 1.5H114a8 8 0 0 1 8 8v44a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8z"
            fill="var(--surface-2)"
            stroke="var(--line)"
            strokeWidth="2"
          />
          {/* передняя створка */}
          <path
            d="M12 50h104a5 5 0 0 1 4.9 6l-4.6 25a9 9 0 0 1-8.9 7.4H20.6a9 9 0 0 1-8.9-7.4l-4.6-25A5 5 0 0 1 12 50z"
            fill="var(--red-light)"
            stroke="var(--red-line)"
            strokeWidth="2"
          />
        </g>
      )}
      {/* искры */}
      <g fill="var(--red)">
        <path d={SPARK_PATH} transform="translate(96 2) scale(.72)" />
        <path d={SPARK_PATH} transform="translate(116 22) scale(.4)" />
        <path d={SPARK_PATH} transform="translate(8 6) scale(.34)" opacity=".7" />
      </g>
    </svg>
  );
}

function initials(name) {
  return (name || '')
    .replace(/(ООО|ОАО|ЗАО|АО|ПАО|ИП)\s*/gi, '')
    .replace(/[«»"]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

/* ============================================================
   Экран 1. Вход и регистрация
   ============================================================ */

function LoginScreen({ onLogin, theme, onToggleTheme }) {
  const [form, setForm] = useState({
    phone: '+7 (999) 123-45-67',
    name: 'Иван Иванов',
    company: 'ООО «Ромашка»'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  async function submit(event) {
    event.preventDefault();
    if (!form.phone.trim() || !form.name.trim()) {
      setError('Заполните телефон и имя — по ним банк найдёт компанию в ЕГРЮЛ');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await apiLogin(form.phone, form.name, form.company);
      onLogin(result);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <div className="auth">
      <section className="auth__brand">
        <div className="auth__pattern" />
        <div className="auth__brand-top">
          <img className="auth__logo" src="assets/logo-main.png" alt="" />
          <div className="auth__brand-name">Альфа-Банк · Бизнес</div>
        </div>

        <div className="auth__brand-body">
          <h1 className="auth__title">Умный кредитный кабинет предпринимателя</h1>
          <p className="auth__subtitle">
            Подбор продукта, заявка, скоринг и решение банка — в одном окне,
            без переписки с менеджером и повторного ввода документов.
          </p>
          <ul className="auth__points">
            <li className="auth__point"><span>1</span><span>Ассистент подбирает продукт по задаче бизнеса, а не по названию тарифа</span></li>
            <li className="auth__point"><span>2</span><span>Данные компании подтягиваются из ЕГРЮЛ — заполнять нечего</span></li>
            <li className="auth__point"><span>3</span><span>Статус заявки виден на каждом этапе, вместе с причиной решения</span></li>
          </ul>
        </div>

        <img className="auth__hero" src="assets/illus-hero.png" alt="" />
        <p className="auth__legal">Прототип. Синтетические данные, реальные операции не выполняются.</p>
      </section>

      <section className="auth__pane">
        <div className="auth__toolbar">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>
        <img className="auth__blob auth__blob--1" src="assets/blob-1.png" alt="" />
        <img className="auth__blob auth__blob--2" src="assets/blob-2.png" alt="" />

        <form className="auth__form" onSubmit={submit}>
          <div className="auth__form-head">
            <h2 className="h1">Вход в кабинет</h2>
            <p className="lead">Для действующих ИП и юридических лиц</p>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="phone">Телефон</label>
            <input id="phone" className="input" type="tel" value={form.phone} onChange={update('phone')} autoComplete="tel" />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="name">Имя и фамилия</label>
            <input id="name" className="input" type="text" value={form.name} onChange={update('name')} autoComplete="name" />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="company">Компания</label>
            <input id="company" className="input" type="text" value={form.company} onChange={update('company')} autoComplete="organization" />
            <span className="field__hint">ИНН, ОКВЭД и обороты подтянутся из ЕГРЮЛ/ЕГРИП</span>
          </div>

          {error && <p className="error-text">{error}</p>}

          <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
            {loading ? 'Проверяем данные…' : 'Зарегистрироваться'}
          </button>

          <div className="auth__demo">
            <img src="assets/icon-zap.png" alt="" width="18" height="18" />
            <span>Демо-режим: поля заполнены тестовыми данными, можно сразу войти.</span>
          </div>
        </form>
      </section>
    </div>
  );
}

/* ============================================================
   Каркас: сайдбар и верхняя панель
   ============================================================ */

const CLIENT_NAV = [
  { key: 'dashboard', label: 'Обзор', icon: 'assets/icon-home.png' },
  { key: 'chat', label: 'ИИ-ассистент', icon: 'assets/icon-sparkles.png' },
  { key: 'application', label: 'Заявка', icon: 'assets/icon-doc.png' },
  { key: 'status', label: 'Статус заявки', icon: 'assets/icon-clock.png' }
];

const BANK_NAV = [{ key: 'crm', label: 'Заявки клиентов', icon: 'assets/icon-doc.png' }];

function Sidebar({ role, screen, onNavigate, pendingCount }) {
  const nav = role === 'bank' ? BANK_NAV : CLIENT_NAV;

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <img className="sidebar__logo" src="assets/logo-main.png" alt="" />
        <div className="sidebar__brand-text">
          Кредитный кабинет
          <span>{role === 'bank' ? 'Бэк-офис банка' : 'Для бизнеса'}</span>
        </div>
      </div>

      <nav className="sidebar__nav">
        <div className="sidebar__section">{role === 'bank' ? 'Работа с заявками' : 'Финансирование'}</div>
        {nav.map((item) => (
          <button
            key={item.key}
            className={'nav-item' + (screen === item.key ? ' nav-item--active' : '')}
            onClick={() => onNavigate(item.key)}
          >
            <img className="nav-item__icon" src={item.icon} alt="" />
            {item.label}
            {item.key === 'crm' && pendingCount > 0 && <span className="nav-item__count">{pendingCount}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar__foot">
        <div className="sidebar__promo">
          <strong>Нужна помощь?</strong>
          Ассистент объяснит условия продукта и причину решения банка простым языком.
        </div>
      </div>
    </aside>
  );
}

function Topbar({ role, onRoleChange, user, company, crumbs, theme, onToggleTheme }) {
  const isBank = role === 'bank';
  const name = isBank ? 'Мария Орлова' : user.name;
  const subtitle = isBank ? 'Кредитный специалист' : company.name;

  return (
    <header className="topbar">
      <div className="topbar__crumbs">{crumbs}</div>
      <div className="topbar__right">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <div className="role-switch" role="group" aria-label="Роль в демо">
          <button
            className={'role-switch__btn' + (!isBank ? ' role-switch__btn--active' : '')}
            onClick={() => onRoleChange('client')}
          >
            Клиент
          </button>
          <button
            className={'role-switch__btn' + (isBank ? ' role-switch__btn--active' : '')}
            onClick={() => onRoleChange('bank')}
          >
            Банк
          </button>
        </div>
        <div className="user-chip">
          <div className="user-chip__avatar">{initials(name)}</div>
          <div>
            <div className="user-chip__name">{name}</div>
            <div className="user-chip__role">{subtitle}</div>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ============================================================
   Экран 2. Обзор (дашборд клиента)
   ============================================================ */

function DashboardScreen({ company, user, applications, onNavigate, onOpenApplication, onPickProduct }) {
  const active = applications.filter((a) => a.status === APP_STATUS.SCORING).length;

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="h1">Здравствуйте, {user.name.split(' ')[0]}</h1>
        <p className="lead">Вот что происходит с финансированием вашего бизнеса</p>
      </div>

      <div className="stack">
        <div className="company">
          <div className="row">
            <div className="company__mark">{initials(company.name)}</div>
            <div>
              <div className="h3">{company.name}</div>
              <div className="company__meta">ИНН {company.inn} · {company.okved} · на рынке {company.age}</div>
            </div>
          </div>
          <div className="company__limit">
            <div className="small muted">Предварительно одобренный лимит</div>
            <div className="value num">{formatMoney(company.preApprovedLimit)}</div>
          </div>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="stat__label">Годовой оборот</div>
            <div className="stat__value num">{formatMoney(company.revenue)}</div>
            <div className="stat__note">по данным расчётного счёта</div>
          </div>
          <div className="stat">
            <div className="stat__label">Оборот за месяц</div>
            <div className="stat__value num">{formatMoney(company.accountTurnover)}</div>
            <div className="stat__note">сентябрь 2026</div>
          </div>
          <div className="stat">
            <div className="stat__label">Сотрудников</div>
            <div className="stat__value num">{company.employees}</div>
            <div className="stat__note">по данным ФНС</div>
          </div>
          <div className="stat">
            <div className="stat__label">Заявок на рассмотрении</div>
            <div className="stat__value stat__value--accent num">{active}</div>
            <div className="stat__note">всего заявок: {applications.length}</div>
          </div>
        </div>

        <div className="assistant-cta">
          <div className="assistant-cta__icon">
            <img src="assets/icon-sparkles.png" alt="" />
          </div>
          <div className="assistant-cta__text">
            <h2 className="h2">Не знаете, какой кредит подойдёт?</h2>
            <p>
              Опишите задачу бизнеса своими словами — ассистент подберёт продукт,
              посчитает платёж и соберёт заявку за вас.
            </p>
          </div>
          <button className="btn" onClick={() => onNavigate('chat')}>
            Подобрать кредит
            <LIcon name="arrow-right" size={16} />
          </button>
        </div>

        <section>
          <div className="card__head">
            <h2 className="h2">Кредитные продукты</h2>
            <span className="small muted">Ставки указаны для вашего сегмента</span>
          </div>
          <div className="grid-3">
            {Object.values(PRODUCTS).map((product) => (
              <article className="product" key={product.id}>
                <img className="product__img" src={product.image} alt="" />
                <div>
                  <h3 className="h3">{product.name}</h3>
                  <div className="product__rate num">{product.rate}%<small>годовых</small></div>
                </div>
                <ul className="product__list">
                  {product.features.map((feature) => <li key={feature}>{feature}</li>)}
                </ul>
                <div className="product__foot">
                  <button className="btn btn--ghost btn--sm" onClick={() => onPickProduct(product.id)}>
                    Оформить заявку
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card__head">
            <h2 className="h2">Мои заявки</h2>
            {applications.length > 0 && (
              <button className="link-btn" onClick={() => onNavigate('chat')}>Новая заявка</button>
            )}
          </div>

          {applications.length === 0 ? (
            <div className="empty">
              <EmptyArt />
              <div className="empty__title">Заявок пока нет</div>
              <p>Расскажите ассистенту, на что нужны деньги, — он подберёт продукт и заполнит заявку.</p>
              <button className="btn btn--primary" onClick={() => onNavigate('chat')}>Подобрать кредит</button>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Заявка</th><th>Продукт</th><th>Сумма</th><th>Срок</th><th>Платёж</th><th>Статус</th><th />
                  </tr>
                </thead>
                <tbody>
                  {applications.map((app) => (
                    <tr key={app.id}>
                      <td className="table__id" data-label="Заявка">№{app.id}</td>
                      <td data-label="Продукт">{app.productName}</td>
                      <td className="num" data-label="Сумма">{formatMoney(app.amount)}</td>
                      <td className="num" data-label="Срок">{app.term} мес.</td>
                      <td className="num" data-label="Платёж">{formatMoney(app.payment)}</td>
                      <td data-label="Статус"><StatusBadge status={app.status} /></td>
                      <td data-label=""><button className="link-btn" onClick={() => onOpenApplication(app.id)}>Открыть</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ============================================================
   Экран 3. ИИ-ассистент
   ============================================================ */

const QUICK_PROMPTS = [
  'Нужен кредит 2 млн на закупку товара',
  'Хочу купить оборудование за 6 млн',
  'Не хватает 500 тысяч до конца месяца'
];

function ChatScreen({ onUseOffer }) {
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      text:
        'Здравствуйте! Я помогу подобрать финансирование для вашего бизнеса. ' +
        'Опишите задачу своими словами — например: «нужен кредит 2 млн на закупку товара».',
      at: new Date().toISOString()
    }
  ]);
  const [offer, setOffer] = useState(null);
  const [context, setContext] = useState({});
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, typing, offer]);

  async function send(text) {
    const trimmed = (text || '').trim();
    if (!trimmed || typing) return;

    const history = [...messages, { role: 'user', text: trimmed, at: new Date().toISOString() }];
    setMessages(history);
    setInput('');
    setTyping(true);

    try {
      const response = await apiSendChatMessage(trimmed, history, context);

      setMessages((prev) => [...prev, { role: 'bot', text: response.reply, at: new Date().toISOString() }]);

      // БЕЗОПАСНО: сохраняем контекст только если он есть и является объектом
      if (response && response.context && typeof response.context === 'object') {
        setContext(response.context);
      }

      if (response && response.offer) {
        setOffer(response.offer);
      }
    } catch (e) {
      console.error('Chat error:', e);
      setMessages((prev) => [...prev, { role: 'bot', text: 'Сервис подбора недоступен. Попробуйте ещё раз.', at: new Date().toISOString() }]);
    } finally {
      setTyping(false);
    }
  }
  return (
    <div className="page">
      <div className="page__head">
        <h1 className="h1">ИИ-ассистент</h1>
        <p className="lead">Ассистент уточнит параметры и подберёт продукт из витрины банка</p>
      </div>

      <div className="chat">
        <div className="chat__panel">
          <div className="chat__head">
            <div className="chat__avatar"><img src="assets/icon-sparkles.png" alt="" /></div>
            <div>
              <div className="h3">ИИ-ассистент</div>
              <div className="chat__status">на связи</div>
            </div>
          </div>

          <div className="chat__log" ref={logRef}>
            {messages.map((message, index) => (
              <div className={'msg ' + (message.role === 'user' ? 'msg--user' : 'msg--bot')} key={index}>
                {message.text}
                <span className="msg__time">{formatTime(message.at)}</span>
              </div>
            ))}

            {typing && <div className="typing"><span /><span /><span /></div>}

            {offer && !typing && (
              <div className="offer">
                <div className="offer__head">
                  <img className="offer__img" src={PRODUCTS[offer.productId].image} alt="" />
                  <div>
                    <div className="h3">{offer.productName}</div>
                    <div className="small muted">{offer.rate}% годовых · {PRODUCTS[offer.productId].pledge}</div>
                  </div>
                </div>
                <div className="offer__grid">
                  <div className="offer__cell">
                    <div className="label">Сумма</div>
                    <div className="value num">{formatMoney(offer.amount)}</div>
                  </div>
                  <div className="offer__cell">
                    <div className="label">Срок</div>
                    <div className="value num">{offer.term} мес.</div>
                  </div>
                  <div className="offer__cell">
                    <div className="label">Платёж</div>
                    <div className="value num">{formatMoney(offer.payment)}</div>
                  </div>
                </div>
                <p className="offer__why">{offer.why}</p>
                <button className="btn btn--primary" onClick={() => onUseOffer(offer)}>
                  Оформить заявку
                </button>
              </div>
            )}
          </div>

          <div className="chips">
            {QUICK_PROMPTS.map((prompt) => (
              <button className="chip" key={prompt} onClick={() => send(prompt)}>{prompt}</button>
            ))}
          </div>

          <form
            className="chat__form"
            onSubmit={(event) => { event.preventDefault(); send(input); }}
          >
            <input
              className="input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Опишите задачу или напишите срок в месяцах"
              aria-label="Сообщение ассистенту"
            />
            <button className="btn btn--primary" type="submit" disabled={typing || !input.trim()}>
              <LIcon name="send" size={16} />
              Отправить
            </button>
          </form>
        </div>

        <aside className="card">
          <h2 className="h3" style={{ marginBottom: '14px' }}>Как это работает</h2>
          <div className="side-note">
            <div className="side-note__item">
              <img src="assets/icon-chat.png" alt="" />
              <span>Ассистент задаёт вопросы о задаче, сумме и сроке — банковских терминов знать не нужно.</span>
            </div>
            <div className="side-note__item">
              <img src="assets/icon-trend.png" alt="" />
              <span>Подбор идёт по витрине продуктов: сумма, срок, требование залога, ставка сегмента.</span>
            </div>
            <div className="side-note__item">
              <img src="assets/icon-doc.png" alt="" />
              <span>Параметры из диалога переносятся в заявку — повторно вводить ничего не нужно.</span>
            </div>
            <div className="side-note__item">
              <img src="assets/icon-check.png" alt="" />
              <span>Рекомендация предварительная: окончательные условия банк подтверждает после скоринга.</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ============================================================
   Экран 4. Заявка
   ============================================================ */

const DOCUMENTS = [
  { name: 'Выписка по расчётному счёту', source: 'получена из банка' },
  { name: 'Бухгалтерская отчётность', source: 'получена из ФНС' },
  { name: 'Устав и решение о назначении', source: 'загружен ранее' }
];

function ApplicationScreen({ draft, company, onSubmitted, onNavigate }) {
  const [productId, setProductId] = useState(draft ? draft.productId : 'working');
  const [amount, setAmount] = useState(draft ? draft.amount : 2_000_000);
  const [term, setTerm] = useState(draft ? draft.term : 12);
  const [purpose, setPurpose] = useState(draft ? PRODUCTS[draft.productId].defaultPurpose : '');
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [extraDocs, setExtraDocs] = useState([]);

  const product = PRODUCTS[productId];
  const payment = useMemo(() => calcPayment(amount, term, product.rate), [amount, term, product.rate]);
  const total = payment * term;
  const overpay = total - amount;

  function validate() {
    const next = {};
    if (!amount || amount < product.minAmount) next.amount = `Минимум для продукта — ${formatMoney(product.minAmount)}`;
    if (amount > product.maxAmount) next.amount = `Максимум для продукта — ${formatMoney(product.maxAmount)}`;
    if (!term || term < product.minTerm) next.term = `Минимальный срок — ${product.minTerm} мес.`;
    if (term > product.maxTerm) next.term = `Максимальный срок — ${product.maxTerm} мес.`;
    if (!purpose.trim()) next.purpose = 'Укажите, на что нужны деньги — это влияет на решение';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event) {
    event.preventDefault();
    if (!validate()) return;
    setSending(true);
    try {
      const application = await apiCreateApplication({
        productId, amount, term, purpose, company,
        documents: [...DOCUMENTS.map((d) => d.name), ...extraDocs]
      });
      onSubmitted(application);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="h1">Заявка на кредит</h1>
        <p className="lead">
          {draft
            ? 'Параметры перенесены из диалога с ассистентом — проверьте и отправьте'
            : 'Проверьте параметры: расчёт обновляется сразу'}
        </p>
      </div>

      <form className="grid-2" onSubmit={submit}>
        <div className="stack">
          <section className="card">
            <h2 className="h2" style={{ marginBottom: '18px' }}>Параметры кредита</h2>

            <div className="stack" style={{ gap: '18px' }}>
              <div className="field">
                <label className="field__label" htmlFor="product">Продукт</label>
                <select
                  id="product"
                  className="select"
                  value={productId}
                  onChange={(event) => setProductId(event.target.value)}
                >
                  {Object.values(PRODUCTS).map((item) => (
                    <option key={item.id} value={item.id}>{item.name} — {item.rate}% годовых</option>
                  ))}
                </select>
                <span className="field__hint">{product.purpose}</span>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="amount">Сумма, ₽</label>
                <input
                  id="amount"
                  className={'input' + (errors.amount ? ' input--error' : '')}
                  type="number"
                  value={amount}
                  step="50000"
                  onChange={(event) => setAmount(Number(event.target.value))}
                />
                <input
                  className="range"
                  type="range"
                  min={product.minAmount}
                  max={product.maxAmount}
                  step="50000"
                  value={Math.min(Math.max(amount, product.minAmount), product.maxAmount)}
                  onChange={(event) => setAmount(Number(event.target.value))}
                  aria-label="Сумма кредита"
                />
                {errors.amount
                  ? <span className="error-text">{errors.amount}</span>
                  : <span className="field__hint">{formatMoney(product.minAmount)} — {formatMoney(product.maxAmount)}</span>}
              </div>

              <div className="field">
                <label className="field__label" htmlFor="term">Срок, месяцев</label>
                <input
                  id="term"
                  className={'input' + (errors.term ? ' input--error' : '')}
                  type="number"
                  value={term}
                  onChange={(event) => setTerm(Number(event.target.value))}
                />
                <input
                  className="range"
                  type="range"
                  min={product.minTerm}
                  max={product.maxTerm}
                  value={Math.min(Math.max(term, product.minTerm), product.maxTerm)}
                  onChange={(event) => setTerm(Number(event.target.value))}
                  aria-label="Срок кредита"
                />
                {errors.term
                  ? <span className="error-text">{errors.term}</span>
                  : <span className="field__hint">{product.minTerm}–{product.maxTerm} месяцев</span>}
              </div>

              <div className="field">
                <label className="field__label" htmlFor="purpose">На что нужны деньги</label>
                <textarea
                  id="purpose"
                  className={'textarea' + (errors.purpose ? ' input--error' : '')}
                  value={purpose}
                  placeholder="Например: закупка товара на новогодний сезон"
                  onChange={(event) => setPurpose(event.target.value)}
                />
                {errors.purpose && <span className="error-text">{errors.purpose}</span>}
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="h2" style={{ marginBottom: '14px' }}>Документы</h2>
            <div className="dropzone">
              {DOCUMENTS.map((doc) => (
                <div className="doc-row" key={doc.name}>
                  <img src="assets/icon-doc.png" alt="" />
                  <span>{doc.name}</span>
                  <span className="ok">{doc.source}</span>
                </div>
              ))}
              {extraDocs.map((doc) => (
                <div className="doc-row" key={doc}>
                  <img src="assets/icon-doc.png" alt="" />
                  <span>{doc}</span>
                  <span className="ok">добавлен</span>
                </div>
              ))}
              <div className="field">
                <label className="field__label" htmlFor="files">Добавить документ</label>
                <input
                  id="files"
                  type="file"
                  multiple
                  onChange={(event) => setExtraDocs(Array.from(event.target.files).map((f) => f.name))}
                />
                <span className="field__hint">В прототипе файлы не передаются на сервер.</span>
              </div>
            </div>
          </section>
        </div>

        <aside className="card">
          <h2 className="h2" style={{ marginBottom: '16px' }}>Предварительный расчёт</h2>

          <div className="summary__payment">
            <div className="label">Платёж в месяц</div>
            <div className="value num">{formatMoney(payment)}</div>
          </div>

          <div className="summary__row"><span className="label">Продукт</span><span className="value">{product.name}</span></div>
          <div className="summary__row"><span className="label">Ставка</span><span className="value num">{product.rate}% годовых</span></div>
          <div className="summary__row"><span className="label">Сумма</span><span className="value num">{formatMoney(amount)}</span></div>
          <div className="summary__row"><span className="label">Срок</span><span className="value num">{term} мес.</span></div>
          <div className="summary__row"><span className="label">Переплата</span><span className="value num">{formatMoney(overpay)}</span></div>
          <div className="summary__row"><span className="label">Всего к возврату</span><span className="value num">{formatMoney(total)}</span></div>

          <button className="btn btn--primary btn--block" type="submit" disabled={sending} style={{ marginTop: '18px' }}>
            {sending ? 'Отправляем…' : 'Отправить заявку'}
          </button>
          <button className="btn btn--quiet btn--block" type="button" onClick={() => onNavigate('dashboard')} style={{ marginTop: '8px' }}>
            Вернуться к обзору
          </button>

          <p className="tiny" style={{ marginTop: '14px' }}>
            Расчёт предварительный и не является публичной офертой. Итоговые условия банк
            подтверждает после проверки данных и скоринга.
          </p>
        </aside>
      </form>
    </div>
  );
}

/* ============================================================
   Экран 5. Статус заявки
   ============================================================ */

const STATUS_VIEW = {
  scoring: {
    image: 'assets/illus-processing.png',
    title: 'Заявка на скоринге',
    text: 'Данные приняты и проверены. Кредитный специалист видит вашу заявку и примет решение.',
    tone: ''
  },
  approved: {
    image: 'assets/illus-approved.png',
    title: 'Кредит одобрен',
    text: 'Банк подтвердил запрошенные условия. Следующий шаг — подписание документов.',
    tone: 'decision--approved'
  },
  counter: {
    image: 'assets/illus-processing.png',
    title: 'Банк предлагает другие условия',
    text: 'На запрошенных условиях выдать не получится, но есть альтернативный вариант.',
    tone: 'decision--counter'
  },
  rejected: {
    image: 'assets/illus-rejected.png',
    title: 'Банк отказал',
    text: 'Решение можно пересмотреть: исправьте причину отказа и подайте заявку снова.',
    tone: 'decision--rejected'
  },
  signing: {
    image: 'assets/illus-processing.png',
    title: 'Подписание документов',
    text: 'Договор и график платежей сформированы. Подтвердите подписание кодом.',
    tone: 'decision--counter'
  },
  signed: {
    image: 'assets/illus-processing.png',
    title: 'Документы подписаны',
    text: 'Перечисляем деньги на расчётный счёт — это займёт несколько секунд.',
    tone: 'decision--approved'
  },
  issued: {
    image: 'assets/illus-approved.png',
    title: 'Кредит выдан',
    text: 'Деньги на счёте. График платежей доступен в кабинете.',
    tone: 'decision--approved'
  }
};

const TRACK_STEPS = ['Создана', 'Проверка данных', 'Скоринг', 'Решение', 'Подписание', 'Выдача'];

/* Текущий этап конвейера по статусу заявки */
function trackIndex(status) {
  switch (status) {
    case APP_STATUS.SCORING: return 2;
    case APP_STATUS.APPROVED:
    case APP_STATUS.COUNTER:
    case APP_STATUS.REJECTED: return 3;
    case APP_STATUS.SIGNING: return 4;
    case APP_STATUS.SIGNED: return 5;
    case APP_STATUS.ISSUED: return 6;
    default: return 0;
  }
}

/* Подписание: документы, согласие и код подтверждения — всё внутри продукта */
function SigningBlock({ application, onSign, busy }) {
  const [code, setCode] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!agreed) { setError('Подтвердите, что ознакомились с условиями договора'); return; }
    if (code.trim().length !== 4) { setError('Код состоит из четырёх цифр'); return; }
    setError('');
    try {
      await onSign(application.id, code.trim());
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <form className="signing" onSubmit={submit}>
      <div className="signing__docs">
        <div className="doc-row">
          <img src="assets/icon-doc.png" alt="" />
          <span>Кредитный договор №{application.id}/26</span>
          <span className="ok">сформирован</span>
        </div>
        <div className="doc-row">
          <img src="assets/icon-doc.png" alt="" />
          <span>График платежей на {application.term} мес.</span>
          <span className="ok">сформирован</span>
        </div>
      </div>

      <label className="checkbox">
        <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
        <span>Ознакомлен с условиями договора и графиком платежей</span>
      </label>

      <div className="signing__code">
        <div className="field">
          <label className="field__label" htmlFor="sign-code">Код подтверждения</label>
          <input
            id="sign-code"
            className={'input input--code' + (error ? ' input--error' : '')}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            placeholder="0000"
            autoComplete="one-time-code"
          />
        </div>
        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? 'Подписываем…' : 'Подписать'}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <p className="tiny">
        Демо-режим: внешних каналов подтверждения нет, код показан прямо здесь — <b>{application.signCode}</b>.
      </p>
    </form>
  );
}

function StatusScreen({ application, onNavigate, onAcceptCounter, onAcceptOffer, onSign, busy }) {
  if (!application) {
    return (
      <div className="page">
        <div className="page__head">
          <h1 className="h1">Статус заявки</h1>
          <p className="lead">Здесь виден путь заявки от создания до решения банка</p>
        </div>
        <div className="card">
          <div className="empty">
            <EmptyArt />
            <div className="empty__title">Активной заявки нет</div>
            <p>Отправьте заявку — и этот экран покажет этапы обработки и причину решения.</p>
            <button className="btn btn--primary" onClick={() => onNavigate('chat')}>Подобрать кредит</button>
          </div>
        </div>
      </div>
    );
  }

  const view = STATUS_VIEW[application.status] || STATUS_VIEW.scoring;
  const decided = application.status !== APP_STATUS.SCORING;
  const currentStep = trackIndex(application.status);
  const stopped = application.status === APP_STATUS.REJECTED;

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="h1">Заявка №{application.id}</h1>
        <p className="lead">{application.productName} · {formatMoney(application.amount)} · {application.term} мес.</p>
      </div>

      <div className="stack">
        <section className="card">
          <div className="card__head">
            <div className="status-hero">
              <img className="status-hero__img" src={view.image} alt="" />
              <div className="status-hero__text">
                <h2 className="h2">{view.title}</h2>
                <p className="lead">{view.text}</p>
              </div>
            </div>
            <StatusBadge status={application.status} />
          </div>

          <div className="tracker">
            {TRACK_STEPS.map((label, index) => {
              const state = index < currentStep
                ? ' tracker__step--done'
                : index === currentStep && !stopped ? ' tracker__step--active' : '';
              return (
                <div className={'tracker__step' + state} key={label}>
                  <div className="tracker__dot">{index < currentStep ? '✓' : index + 1}</div>
                  <div className="tracker__label">
                    {label}
                    {index < currentStep && <span className="tracker__time">{formatTime(application.history[Math.min(index, application.history.length - 1)].at)}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <div className={'decision ' + view.tone} style={{ marginTop: '22px' }}>
            <div className="decision__title">
              {decided ? 'Комментарий банка' : 'Что происходит сейчас'}
            </div>
            <p className="decision__text">
              {application.decisionComment ||
                'Заявка в очереди на рассмотрение. Обычно решение занимает до 2 минут, вы увидите его на этом экране.'}
            </p>

            {application.status === APP_STATUS.COUNTER && application.counterOffer && (
              <div className="stack" style={{ gap: '12px', marginTop: '6px' }}>
                <div className="offer__grid">
                  <div className="offer__cell">
                    <div className="label">Новая сумма</div>
                    <div className="value num">{formatMoney(application.counterOffer.amount)}</div>
                  </div>
                  <div className="offer__cell">
                    <div className="label">Новый срок</div>
                    <div className="value num">{application.counterOffer.term} мес.</div>
                  </div>
                  <div className="offer__cell">
                    <div className="label">Платёж</div>
                    <div className="value num">{formatMoney(application.counterOffer.payment)}</div>
                  </div>
                </div>
                <div className="row">
                  <button className="btn btn--primary btn--sm" onClick={() => onAcceptCounter(application)}>
                    Принять условия
                  </button>
                  <button className="btn btn--ghost btn--sm" onClick={() => onNavigate('chat')}>
                    Обсудить с ассистентом
                  </button>
                </div>
              </div>
            )}

            {application.status === APP_STATUS.APPROVED && (
              <div className="row" style={{ marginTop: '6px' }}>
                <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => onAcceptOffer(application)}>
                  Принять предложение
                </button>
                <span className="tiny">Дальше — подписание договора и перечисление денег на счёт</span>
              </div>
            )}

            {application.status === APP_STATUS.REJECTED && (
              <div className="row" style={{ marginTop: '6px' }}>
                <button className="btn btn--ghost btn--sm" onClick={() => onNavigate('chat')}>
                  Подобрать другой продукт
                </button>
              </div>
            )}
          </div>

          {application.status === APP_STATUS.SIGNING && (
            <div className="signing-card">
              <h3 className="h2">Подписание документов</h3>
              <p className="lead" style={{ marginBottom: '16px' }}>
                Проверьте документы и подтвердите подписание кодом — всё происходит внутри кабинета.
              </p>
              <SigningBlock application={application} onSign={onSign} busy={busy} />
            </div>
          )}

          {application.status === APP_STATUS.SIGNED && (
            <div className="signing-card">
              <div className="row">
                <div className="typing"><span /><span /><span /></div>
                <span>Перечисляем {formatMoney(application.amount)} на счёт {application.account}…</span>
              </div>
            </div>
          )}

          {application.status === APP_STATUS.ISSUED && (
            <div className="issued">
              <div className="issued__grid">
                <div className="offer__cell">
                  <div className="label">Перечислено</div>
                  <div className="value num">{formatMoney(application.amount)}</div>
                </div>
                <div className="offer__cell">
                  <div className="label">Счёт зачисления</div>
                  <div className="value num">{application.account}</div>
                </div>
                <div className="offer__cell">
                  <div className="label">Первый платёж</div>
                  <div className="value num">{application.firstPaymentDate} · {formatMoney(application.payment)}</div>
                </div>
              </div>
              <p className="tiny">
                Выдача смоделирована: реальных переводов прототип не выполняет.
              </p>
            </div>
          )}
        </section>

        <div className="grid-2">
          <section className="card">
            <h2 className="h2" style={{ marginBottom: '16px' }}>Оценка риска</h2>
            <div className="row" style={{ marginBottom: '18px' }}>
              <div className="score__value" style={{ fontSize: '30px' }}>{application.score}</div>
              <div className="small muted">баллов из 100 — сводная оценка скоринга</div>
            </div>
            <div className="factors">
              {(application.factors || []).map((factor) => (
                <div className="factor" key={factor.name}>
                  <span>{factor.name}</span>
                  <span className="factor__value">{factor.value}</span>
                  <div className="factor__bar">
                    <div
                      className={'factor__fill' + (factor.value >= 75 ? ' factor__fill--good' : factor.value >= 50 ? ' factor__fill--warn' : '')}
                      style={{ width: factor.value + '%' }}
                    />
                  </div>
                  <span className="tiny" style={{ gridColumn: '1 / -1' }}>{factor.comment}</span>
                </div>
              ))}
            </div>
            <p className="tiny" style={{ marginTop: '16px' }}>
              Скоринг показывает уровень риска. Решение принимает банк — с учётом продукта,
              внутренних правил и результатов проверок.
            </p>
          </section>

          <section className="card">
            <h2 className="h2" style={{ marginBottom: '16px' }}>История заявки</h2>
            <div className="timeline">
              {application.history.map((event, index) => (
                <div className="timeline__item" key={index}>
                  <div className="timeline__dot" />
                  <div>
                    <div className="h3">{event.title}</div>
                    <div className="small muted">{event.text}</div>
                    <div className="timeline__meta">{formatTime(event.at)}</div>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn--ghost btn--block" style={{ marginTop: '18px' }} onClick={() => onNavigate('dashboard')}>
              Вернуться к обзору
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Экран 6. CRM банка
   ============================================================ */

const CRM_FILTERS = [
  { key: 'all', label: 'Все заявки' },
  { key: 'scoring', label: 'Ждут решения' },
  { key: 'done', label: 'Решение принято' }
];

function BankScreen({ applications, onDecision, busyId }) {
  const [filter, setFilter] = useState('scoring');

  const visible = applications.filter((app) => {
    if (filter === 'scoring') return app.status === APP_STATUS.SCORING;
    if (filter === 'done') return app.status !== APP_STATUS.SCORING;
    return true;
  });

  const pending = applications.filter((a) => a.status === APP_STATUS.SCORING);
  const volume = pending.reduce((sum, a) => sum + a.amount, 0);

  return (
    <div className="page">
      <div className="page__head">
        <h1 className="h1">Заявки клиентов</h1>
        <p className="lead">Очередь кредитных специалистов: скоринг выполнен, решение — за человеком</p>
      </div>

      <div className="stack">
        <div className="stats">
          <div className="stat">
            <div className="stat__label">Ждут решения</div>
            <div className="stat__value stat__value--accent num">{pending.length}</div>
          </div>
          <div className="stat">
            <div className="stat__label">Объём в очереди</div>
            <div className="stat__value num">{formatMoney(volume)}</div>
          </div>
          <div className="stat">
            <div className="stat__label">Всего заявок</div>
            <div className="stat__value num">{applications.length}</div>
          </div>
          <div className="stat">
            <div className="stat__label">Средний балл</div>
            <div className="stat__value num">
              {applications.length
                ? Math.round(applications.reduce((s, a) => s + (a.score || 0), 0) / applications.length)
                : '—'}
            </div>
          </div>
        </div>

        <section className="card">
          <div className="card__head">
            <div className="role-switch">
              {CRM_FILTERS.map((item) => (
                <button
                  key={item.key}
                  className={'role-switch__btn' + (filter === item.key ? ' role-switch__btn--active' : '')}
                  onClick={() => setFilter(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <span className="small muted">Решение сразу видно клиенту в его кабинете</span>
          </div>

          {visible.length === 0 ? (
            <div className="empty">
              <EmptyArt variant="bank" />
              <div className="empty__title">В этой вкладке пусто</div>
              <p>
                {filter === 'scoring'
                  ? 'Все заявки разобраны. Новые появятся здесь сразу после отправки клиентом.'
                  : 'Решений пока нет — начните с вкладки «Ждут решения».'}
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Заявка</th><th>Клиент</th><th>Продукт</th><th>Сумма</th>
                    <th>Срок</th><th>Скоринг</th><th>Статус</th><th>Решение</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((app) => (
                    <tr key={app.id}>
                      <td className="table__id" data-label="Заявка">№{app.id}</td>
                      <td data-label="Клиент">
                        {app.companyName}
                        <div className="tiny">ИНН {app.inn}</div>
                      </td>
                      <td data-label="Продукт">{app.productName}<div className="tiny">{app.rate}% годовых</div></td>
                      <td className="num" data-label="Сумма">{formatMoney(app.amount)}</td>
                      <td className="num" data-label="Срок">{app.term} мес.</td>
                      <td data-label="Скоринг">
                        <div className="score">
                          <div className="score__track">
                            <div
                              className="score__fill"
                              style={{
                                width: (app.score || 0) + '%',
                                background: app.score >= 75 ? 'var(--green)' : app.score >= 55 ? 'var(--amber)' : 'var(--red)'
                              }}
                            />
                          </div>
                          <span className="score__value">{app.score}</span>
                        </div>
                      </td>
                      <td data-label="Статус"><StatusBadge status={app.status} /></td>
                      <td data-label="Решение">
                        {app.status === APP_STATUS.SCORING ? (
                          <div className="row" style={{ gap: '6px' }}>
                            <button
                              className="btn btn--success btn--sm"
                              disabled={busyId === app.id}
                              onClick={() => onDecision(app.id, APP_STATUS.APPROVED)}
                            >
                              <LIcon name="check" size={15} />
                              Одобрить
                            </button>
                            <button
                              className="btn btn--violet btn--sm"
                              disabled={busyId === app.id}
                              onClick={() => onDecision(app.id, APP_STATUS.COUNTER)}
                            >
                              <LIcon name="repeat" size={15} />
                              Иные условия
                            </button>
                            <button
                              className="btn btn--danger btn--sm"
                              disabled={busyId === app.id}
                              onClick={() => onDecision(app.id, APP_STATUS.REJECTED)}
                            >
                              <LIcon name="x" size={15} />
                              Отклонить
                            </button>
                          </div>
                        ) : (
                          <span className="tiny">{app.decisionComment}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ============================================================
   Корневой компонент: состояние приложения и маршрутизация
   ============================================================ */

function App() {
  const [screen, setScreen] = useState('login');
  const [role, setRole] = useState('client');
  const [session, setSession] = useState(null);
  const [applications, setApplications] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('akk-theme', theme); } catch (e) { /* приватный режим */ }
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark')), []);

  const notify = useCallback((text) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3600);
  }, []);

  const refresh = useCallback(async () => {
    const list = await apiGetApplications();
    setApplications(list);
    return list;
  }, []);

  useEffect(() => {
    if (session) refresh();
  }, [session, screen, refresh]);

  if (!session || screen === 'login') {
    return (
      <LoginScreen
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogin={(result) => {
          setSession(result);
          setScreen('dashboard');
          notify('Добро пожаловать! Данные компании загружены из ЕГРЮЛ.');
        }}
      />
    );
  }

  const { user, company } = session;
  const myApplications = applications.filter((a) => a.client_id === (user.client_id || 'client_001'));
  const current = applications.find((a) => a.id === currentId) || myApplications[0] || null;
  const pendingCount = applications.filter((a) => a.status === APP_STATUS.SCORING).length;

  function navigate(next) {
    setScreen(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function changeRole(nextRole) {
    setRole(nextRole);
    navigate(nextRole === 'bank' ? 'crm' : 'dashboard');
  }

  async function handleDecision(id, status) {
    setBusyId(id);
    try {
      const updated = await apiBankDecision(id, status);
      await refresh();
      notify(`Заявка №${id}: ${STATUS_LABEL[updated.status].toLowerCase()}. Клиент уже видит решение.`);
    } finally {
      setBusyId(null);
    }
  }

  async function acceptCounter(application) {
    setBusy(true);
    try {
      await apiAcceptOffer(application.id);
      await refresh();
      notify('Альтернативные условия приняты. Проверьте договор и подтвердите подписание.');
    } finally {
      setBusy(false);
    }
  }

  async function acceptOffer(application) {
    setBusy(true);
    try {
      await apiAcceptOffer(application.id);
      await refresh();
      notify('Предложение принято. Документы сформированы — подтвердите подписание кодом.');
    } finally {
      setBusy(false);
    }
  }

  async function signDocuments(id, code) {
    setBusy(true);
    try {
      await apiSignDocuments(id, code);   // бросит ошибку, если код не совпал
      await refresh();
      notify('Документы подписаны. Отправляем деньги на счёт.');
      const issued = await apiDisburse(id);
      await refresh();
      notify(`Кредит выдан: ${formatMoney(issued.amount)} зачислены на счёт.`);
    } finally {
      setBusy(false);
    }
  }

  const crumbs = role === 'bank'
    ? 'Бэк-офис · Кредитный конвейер'
    : 'Кабинет · ' + company.name;

  const screens = {
    dashboard: (
      <DashboardScreen
        company={company}
        user={user}
        applications={myApplications}
        onNavigate={navigate}
        onOpenApplication={(id) => { setCurrentId(id); navigate('status'); }}
        onPickProduct={(productId) => {
          const product = PRODUCTS[productId];
          setDraft({ productId, amount: product.minAmount * 2, term: product.minTerm * 2 });
          navigate('application');
        }}
      />
    ),
    chat: (
      <ChatScreen
        onUseOffer={(offer) => {
          setDraft(offer);
          navigate('application');
          notify('Параметры перенесены в заявку');
        }}
      />
    ),
    application: (
      <ApplicationScreen
        draft={draft}
        company={company}
        onNavigate={navigate}
        onSubmitted={async (application) => {
          await refresh();
          setCurrentId(application.id);
          setDraft(null);
          navigate('status');
          notify(`Заявка №${application.id} отправлена. Скоринг выполнен, ждём решение банка.`);
        }}
      />
    ),
    status: (
      <StatusScreen
        application={current}
        onNavigate={navigate}
        onAcceptCounter={acceptCounter}
        onAcceptOffer={acceptOffer}
        onSign={signDocuments}
        busy={busy}
      />
    ),
    crm: (
      <BankScreen
        applications={applications}
        onDecision={handleDecision}
        busyId={busyId}
      />
    )
  };

  return (
    <div className="shell">
      <Sidebar role={role} screen={screen} onNavigate={navigate} pendingCount={pendingCount} />
      <div className="main">
        <Topbar
          role={role}
          onRoleChange={changeRole}
          user={user}
          company={company}
          crumbs={crumbs}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        {screens[screen] || screens.dashboard}
      </div>

      <div className="toasts">
        {toasts.map((toast) => <div className="toast" key={toast.id}>{toast.text}</div>)}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
