# backend/models.py (complemento)
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # ===== Dados de cliente =====
    doc_type = Column(String(10), nullable=True)       # 'CPF' | 'CNPJ'
    doc_number = Column(String(20), nullable=True)     # índice em __table_args__
    phone = Column(String(20), nullable=True)

    cep = Column(String(9), nullable=True)
    address = Column(String(255), nullable=True)
    number = Column(String(30), nullable=True)
    complement = Column(String(120), nullable=True)
    district = Column(String(120), nullable=True)
    city = Column(String(120), nullable=True)
    state = Column(String(2), nullable=True)

    # ✅ índices/constraints extras da tabela
    __table_args__ = (
        Index("idx_users_doc_number", "doc_number"),
    )
class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    sku = Column(String(120), unique=True, nullable=False)
    price = Column(Float, nullable=False)
    category = Column(String(120), default="")
    tags = Column(String(255), default="")
    image_url = Column(String(500), default="")
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Order(Base):
    __tablename__ = "orders"
    id = Column(Integer, primary_key=True, index=True)
    status = Column(String(30), default="created", nullable=False)   # created, approved, pending, rejected, cancelled
    total_amount = Column(Float, default=0.0, nullable=False)
    customer_name = Column(String(120), default="", nullable=False)
    customer_email = Column(String(255), default="", nullable=False)
    mp_preference_id = Column(String(80), default="", nullable=False)
    mp_payment_id = Column(String(80), default="", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    name = Column(String(255), nullable=False)
    sku = Column(String(120), nullable=False)
    unit_price = Column(Float, nullable=False)
    quantity = Column(Integer, nullable=False)

    order = relationship("Order", back_populates="items")









 
