from sqlalchemy import Column, Integer, String, Float, JSON, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from datetime import datetime

DATABASE_URL = "sqlite+aiosqlite:///./credit_pipeline.db"
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()


class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String, index=True)
    company_name = Column(String, nullable=True)
    inn = Column(String, nullable=True)
    amount = Column(Float)
    term = Column(Integer)
    product_id = Column(String, nullable=True)
    product_name = Column(String, nullable=True)
    rate = Column(Float, nullable=True)
    purpose = Column(String, nullable=True)
    payment = Column(Float, nullable=True)
    account = Column(String, nullable=True)
    sign_code = Column(String, nullable=True)
    status = Column(String, default="scoring")
    score = Column(Integer, nullable=True)
    factors = Column(JSON, nullable=True)
    decision_comment = Column(String, nullable=True)
    decision_data = Column(JSON, nullable=True)
    counter_offer = Column(JSON, nullable=True)
    history = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    signed_at = Column(DateTime, nullable=True)
    issued_at = Column(DateTime, nullable=True)
    first_payment_date = Column(String, nullable=True)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)



    async with AsyncSessionLocal() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(Application).where(Application.status.in_(["approved", "counter_offer", "declined"]))
        )
        changed = False
        for item in result.scalars().all():
            history = item.history or []
            has_human_decision = bool(item.decision_comment) or any(
                event.get("title") == "Решение принято" for event in history if isinstance(event, dict)
            )
            if not has_human_decision:
                item.status = "scoring"
                item.decision_comment = None
                item.counter_offer = None
                item.history = history + [{
                    "at": datetime.utcnow().isoformat(),
                    "title": "Возвращена на рассмотрение",
                    "text": "Старая версия прототипа выставила статус автоматически. Заявка возвращена в очередь специалиста.",
                }]
                changed = True
        if changed:
            await session.commit()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
