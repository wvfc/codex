# backend/main.py
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import User, Product, Order, OrderItem
from .auth import (
    create_access_token,
    get_password_hash,
    verify_password,
    get_current_user,
    get_current_admin,
)

# -----------------------------------------------------------------------------
# Config / Mercado Pago
# -----------------------------------------------------------------------------
# ==== topo (mantém os seus imports) ====
import os, json, requests, traceback
from typing import Optional, List
from fastapi import FastAPI, Depends, HTTPException, Request
# ...

# ---- BASE resolvida para https absoluto ----
def _sanitize_base_url(raw: Optional[str]) -> str:
    raw = (raw or "").strip()
    if not raw.startswith(("http://", "https://")):
        return "http://localhost:8001"
    return raw.rstrip("/")

MP_ACCESS_TOKEN = os.getenv("MP_ACCESS_TOKEN", "")
MP_PUBLIC_KEY   = os.getenv("MP_PUBLIC_KEY", "")
MP_BASE_URL     = _sanitize_base_url(os.getenv("MP_BASE_URL") or os.getenv("BASE_URL"))
print("MP_BASE_URL:", MP_BASE_URL)

def make_base_url(request: Request) -> str:
    # prioridade para env (produção)
    base = MP_BASE_URL
    if not base:
        # fallback para cabeçalhos/proxy
        host = request.headers.get("x-forwarded-host") or request.headers.get("host")
        scheme = request.headers.get("x-forwarded-proto") or request.url.scheme or "http"
        host = host or request.url.netloc or "localhost:8001"
        base = f"{scheme}://{host}"
    base = base.rstrip("/")
    if not base.startswith(("http://", "https://")):
        raise HTTPException(status_code=500, detail=f"BASE inválida: {base}")
    return base

# -----------------------------------------------------------------------------
# App + CORS
# -----------------------------------------------------------------------------
app = FastAPI(title="SOUTECH Shop API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # em produção, defina domínios específicos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["location"],
)

# -----------------------------------------------------------------------------
# Pastas (caminhos absolutos) e estáticos
# -----------------------------------------------------------------------------
BACKEND_DIR  = Path(__file__).resolve().parent
FRONTEND_DIR = BACKEND_DIR.parent / "frontend"

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

# -----------------------------------------------------------------------------
# DB: cria tabelas (se não existirem)
# -----------------------------------------------------------------------------
Base.metadata.create_all(bind=engine)

# -----------------------------------------------------------------------------
# Schemas (Pydantic v2)
# -----------------------------------------------------------------------------
class SignupIn(BaseModel):
    # login
    name: str = Field(..., min_length=2, max_length=120)
    email: str
    password: str = Field(..., min_length=6, max_length=128)
    # dados do cliente
    doc_type: Optional[str] = Field(None, pattern="^(CPF|CNPJ)$")
    doc_number: Optional[str] = None
    phone: Optional[str] = None
    cep: Optional[str] = None
    address: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None

class LoginIn(BaseModel):
    email: str
    password: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    id: int
    name: str
    email: str
    is_admin: bool
    created_at: datetime
    # extras
    doc_type: Optional[str] = None
    doc_number: Optional[str] = None
    phone: Optional[str] = None
    cep: Optional[str] = None
    address: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    model_config = {"from_attributes": True}

class ProductIn(BaseModel):
    name: str
    sku: str
    price: float
    category: Optional[str] = ""
    tags: Optional[List[str]] = []
    image_url: Optional[str] = ""
    active: bool = True

class ProductOut(ProductIn):
    id: int
    created_at: datetime
    model_config = {"from_attributes": True}

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def _to_out(pr: Product) -> ProductOut:
    return ProductOut(
        id=pr.id,
        name=pr.name,
        sku=pr.sku,
        price=pr.price,
        category=pr.category or "",
        tags=[t for t in (pr.tags or "").split(",") if t],
        image_url=pr.image_url or "",
        active=pr.active,
        created_at=pr.created_at,
    )

def _file_or_404(path: Path) -> FileResponse:
    if not path.exists():
        raise HTTPException(status_code=404, detail="Página não encontrada")
    return FileResponse(str(path))

# -----------------------------------------------------------------------------
# Auth
# -----------------------------------------------------------------------------
@app.post("/api/auth/signup", response_model=UserOut)
def signup(payload: SignupIn, db: Session = Depends(get_db)):
    exists = db.query(User).filter(User.email == payload.email.lower()).first()
    if exists:
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")

    user = User(
        name=payload.name,
        email=payload.email.lower(),
        password_hash=get_password_hash(payload.password),
        is_admin=False,
        # extras
        doc_type=payload.doc_type,
        doc_number=(payload.doc_number or "").strip(),
        phone=(payload.phone or "").strip(),
        cep=(payload.cep or "").strip(),
        address=(payload.address or "").strip(),
        number=(payload.number or "").strip(),
        complement=(payload.complement or "").strip(),
        district=(payload.district or "").strip(),
        city=(payload.city or "").strip(),
        state=(payload.state or "").strip()[:2].upper() if payload.state else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@app.post("/api/auth/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    token = create_access_token(
        {"sub": str(user.id), "email": user.email, "is_admin": user.is_admin}
    )
    return {"access_token": token, "token_type": "bearer"}

@app.get("/api/auth/me", response_model=UserOut)
def me(current=Depends(get_current_user)):
    return current

# -----------------------------------------------------------------------------
# Produtos (público)
# -----------------------------------------------------------------------------
@app.get("/api/products", response_model=List[ProductOut])
def list_products(
    q: Optional[str] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
):
    qry = db.query(Product).filter(Product.active.is_(True))
    if q:
        like = f"%{q.lower()}%"
        qry = qry.filter((Product.name.ilike(like)) | (Product.sku.ilike(like)))
    if category:
        qry = qry.filter(Product.category == category)
    items = qry.order_by(Product.created_at.desc()).all()
    return [_to_out(p) for p in items]

# -----------------------------------------------------------------------------
# Admin (protegido)
# -----------------------------------------------------------------------------
@app.post("/api/admin/products", response_model=ProductOut)
def create_product(
    payload: ProductIn,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    if db.query(Product).filter(Product.sku == payload.sku).first():
        raise HTTPException(status_code=409, detail="SKU já cadastrado.")
    pr = Product(
        name=payload.name,
        sku=payload.sku,
        price=payload.price,
        category=payload.category or "",
        tags=",".join(payload.tags or []),
        image_url=payload.image_url or "",
        active=payload.active,
    )
    db.add(pr)
    db.commit()
    db.refresh(pr)
    return _to_out(pr)

@app.get("/api/admin/products", response_model=List[ProductOut])
def admin_list_products(
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    items = db.query(Product).order_by(Product.created_at.desc()).all()
    return [_to_out(p) for p in items]

@app.put("/api/admin/products/{pid}", response_model=ProductOut)
def update_product(
    pid: int,
    payload: ProductIn,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    pr = db.get(Product, pid)
    if not pr:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    if db.query(Product).filter(Product.sku == payload.sku, Product.id != pid).first():
        raise HTTPException(status_code=409, detail="SKU já cadastrado em outro produto.")
    pr.name = payload.name
    pr.sku = payload.sku
    pr.price = payload.price
    pr.category = payload.category or ""
    pr.tags = ",".join(payload.tags or [])
    pr.image_url = payload.image_url or ""
    pr.active = payload.active
    db.commit()
    db.refresh(pr)
    return _to_out(pr)

@app.delete("/api/admin/products/{pid}")
def delete_product(
    pid: int,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    pr = db.get(Product, pid)
    if not pr:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    db.delete(pr)
    db.commit()
    return {"ok": True}

# -----------------------------------------------------------------------------
# Páginas (HTML)
# -----------------------------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
def home():
    return _file_or_404(FRONTEND_DIR / "index.html")

@app.get("/admin", response_class=HTMLResponse)
def admin_page():
    return _file_or_404(FRONTEND_DIR / "admin.html")

@app.get("/login", response_class=HTMLResponse)
def login_page():
    return _file_or_404(FRONTEND_DIR / "login.html")

@app.get("/cliente", response_class=HTMLResponse)
def cliente_page():
    return _file_or_404(FRONTEND_DIR / "cliente.html")

# -----------------------------------------------------------------------------
# Checkout (Mercado Pago)
# -----------------------------------------------------------------------------
class CheckoutItem(BaseModel):
    product_id: int
    quantity: int = Field(..., ge=1)

class CheckoutIn(BaseModel):
    items: List[CheckoutItem]
    customer_name: Optional[str] = ""
    customer_email: Optional[str] = ""

def mp_create_preference(preference: dict) -> dict:
    headers = {
        "Authorization": f"Bearer {MP_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }
    try:
        r = requests.post(
            "https://api.mercadopago.com/checkout/preferences",
            headers=headers,
            data=json.dumps(preference),
            timeout=25,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha HTTP Mercado Pago: {e!r}")
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=500, detail=f"Mercado Pago erro: {r.text}")
    return r.json()


@app.post("/api/checkout")
def create_checkout(
    payload: CheckoutIn,
    request: Request,
    current: User = Depends(get_current_user),   # <<< OBRIGATÓRIO
    db: Session = Depends(get_db),
):
    if not MP_ACCESS_TOKEN:
        raise HTTPException(status_code=500, detail="Mercado Pago não configurado (MP_ACCESS_TOKEN).")
    if not payload.items:
        raise HTTPException(status_code=400, detail="Carrinho vazio.")

    try:
        # cria pedido já com dados DO BANCO
        order = Order(
            status="created",
            total_amount=0.0,
            customer_name=(current.name or "").strip(),
            customer_email=(current.email or "").strip(),
            mp_preference_id="",
            mp_payment_id="",
        )
        # fallback de e-mail (MP exige e-mail válido)
        if not order.customer_email or "@" not in order.customer_email:
            order.customer_email = "compras@soutechautomacao.com"

        db.add(order)
        db.flush()

        mp_items: list[dict] = []
        total = 0.0

        for it in payload.items:
            if it.quantity < 1:
                raise HTTPException(status_code=400, detail="Quantidade inválida.")

            pr = db.get(Product, it.product_id)
            if not pr or not pr.active:
                raise HTTPException(status_code=400, detail=f"Produto {it.product_id} inválido/inativo.")

            unit = round(float(pr.price), 2)
            if unit < 0:
                raise HTTPException(status_code=400, detail=f"Preço inválido para {pr.name}.")

            total += unit * it.quantity

            db.add(OrderItem(
                order_id=order.id,
                product_id=pr.id,
                name=pr.name,
                sku=pr.sku,
                unit_price=unit,
                quantity=it.quantity,
            ))

            mp_items.append({
                "id": str(pr.id),
                "title": pr.name,
                "currency_id": "BRL",
                "quantity": int(it.quantity),
                "unit_price": unit,
            })

        order.total_amount = round(total, 2)

        base = make_base_url(request)
        preference = {
            "items": mp_items,
            "payer": {"name": order.customer_name, "email": order.customer_email},  # do BD
            "back_urls": {
                "success": f"{base}/checkout/success",
                "failure": f"{base}/checkout/failure",
                "pending": f"{base}/checkout/pending",
            },
            "auto_return": "approved",
            "notification_url": f"{base}/webhooks/mp",
            "statement_descriptor": "SOUTECH",
            "external_reference": str(order.id),
        }

        pref = mp_create_preference(preference)
        order.mp_preference_id = pref.get("id", "")
        db.commit()

        init_point = pref.get("init_point") or pref.get("sandbox_init_point")
        if not init_point:
            raise HTTPException(status_code=500, detail="Não foi possível obter a URL de pagamento (init_point).")

        return {"checkout_url": init_point, "order_id": order.id}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Checkout falhou. Veja logs do servidor.")


@app.get("/checkout/result", response_class=HTMLResponse)
def checkout_result(request: Request, db: Session = Depends(get_db)):
    """
    O MP volta aqui com query params (payment_id/collection_id, status etc).
    Buscamos o pagamento para decidir sucesso/falha/pendente e atualizamos o pedido.
    """
    qp = dict(request.query_params)
    payment_id = qp.get("payment_id") or qp.get("collection_id") or qp.get("id")
    ext_ref    = qp.get("external_reference") or qp.get("externalReference") or ""
    status_qs  = qp.get("status") or qp.get("collection_status") or ""

    status = status_qs.lower()

    # Se vier um payment_id, consultamos o MP para ter o status real:
    if payment_id:
        try:
            r = requests.get(
                f"https://api.mercadopago.com/v1/payments/{payment_id}",
                headers={"Authorization": f"Bearer {MP_ACCESS_TOKEN}"},
                timeout=20
            )
            if r.status_code == 200:
                pay = r.json()
                status = (pay.get("status") or status).lower()
                ext_ref = ext_ref or str(pay.get("external_reference") or "")
                # Atualiza pedido
                if ext_ref.isdigit():
                    o = db.get(Order, int(ext_ref))
                    if o:
                        o.status = status
                        o.mp_payment_id = str(pay.get("id") or "")
                        db.commit()
        except Exception:
            pass

    # Render simples baseado no status:
    def page(title, msg, back="/"):
        return f"""
        <meta charset="utf-8">
        <style>
          body{{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:0;background:#f6f7fb;color:#222}}
          .wrap{{max-width:720px;margin:10vh auto;padding:32px;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.06)}}
          h2{{margin:0 0 8px}} p{{margin:8px 0 0}}
          .btn{{display:inline-block;margin-top:16px;padding:10px 16px;border-radius:10px;background:#004461;color:#fff;text-decoration:none}}
        </style>
        <div class="wrap">
          <h2>{title}</h2>
          <p>{msg}</p>
          <a class="btn" href="{back}">Voltar à loja</a>
        </div>
        """

    if status == "approved":
        return HTMLResponse(page("Pagamento aprovado ✅", "Obrigado pela compra!"))
    if status in ("in_process", "pending", "authorized"):
        return HTMLResponse(page("Pagamento pendente ⏳", "Estamos aguardando a confirmação."))
    # rejected, cancelled, etc.
    return HTMLResponse(page("Pagamento não concluído ❌", "Ocorreu um problema ao processar o pagamento."))



# -----------------------------------------------------------------------------
# WEBHOOK Mercado Pago
# -----------------------------------------------------------------------------
@app.post("/webhooks/mp")
async def mp_webhook(request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()
    except Exception:
        data = {}

    topic = data.get("type") or data.get("topic") or data.get("action", "")
    payment_id = None

    if "payment" in str(topic):
        d = data.get("data") or {}
        payment_id = d.get("id") or d.get("payment_id") or request.query_params.get("id")
        if not payment_id:
            return {"ok": True}

        headers = {"Authorization": f"Bearer {MP_ACCESS_TOKEN}"}
        r = requests.get(
            f"https://api.mercadopago.com/v1/payments/{payment_id}",
            headers=headers,
            timeout=20,
        )
        if r.status_code != 200:
            return {"ok": False, "detail": "payment fetch failed"}

        pay = r.json()
        status = pay.get("status")
        ext_ref = pay.get("external_reference")

        if ext_ref and str(ext_ref).isdigit():
            order = db.get(Order, int(ext_ref))
            if order:
                order.status = status or order.status
                order.mp_payment_id = str(pay.get("id") or "")
                db.commit()

    return {"ok": True}

# -----------------------------------------------------------------------------
# Páginas de retorno
# -----------------------------------------------------------------------------
@app.get("/checkout/success", response_class=HTMLResponse)
def checkout_success():
    html = """
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="4;url=/" />
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:#f6f7fb;color:#222}
      .wrap{max-width:720px;margin:10vh auto;padding:32px;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.06)}
      h2{margin:0 0 8px}
      p{margin:8px 0 0}
      .btn{display:inline-block;margin-top:16px;padding:10px 16px;border-radius:10px;background:#004461;color:#fff;text-decoration:none}
    </style>
    <div class="wrap">
      <h2>Pagamento aprovado ✅</h2>
      <p>Obrigado pela compra! Você será redirecionado para a loja.</p>
      <a class="btn" href="/">Voltar agora para a loja</a>
    </div>
    """
    return HTMLResponse(html)

@app.get("/checkout/failure", response_class=HTMLResponse)
def checkout_failure():
    html = """
    <meta charset="utf-8">
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:#f6f7fb;color:#222}
      .wrap{max-width:720px;margin:10vh auto;padding:32px;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.06)}
      h2{margin:0 0 8px}
      p{margin:8px 0 0}
      .btn{display:inline-block;margin-top:16px;padding:10px 16px;border-radius:10px;background:#004461;color:#fff;text-decoration:none}
    </style>
    <div class="wrap">
      <h2>Pagamento não concluído ❌</h2>
      <p>Ocorreu um problema ao processar o pagamento.</p>
      <a class="btn" href="/">Voltar à loja</a>
    </div>
    """
    return HTMLResponse(html)

@app.get("/checkout/pending", response_class=HTMLResponse)
def checkout_pending():
    html = """
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="6;url=/" />
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:0;background:#f6f7fb;color:#222}
      .wrap{max-width:720px;margin:10vh auto;padding:32px;background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.06)}
      h2{margin:0 0 8px}
      p{margin:8px 0 0}
      .btn{display:inline-block;margin-top:16px;padding:10px 16px;border-radius:10px;background:#004461;color:#fff;text-decoration:none}
    </style>
    <div class="wrap">
      <h2>Pagamento pendente ⏳</h2>
      <p>Estamos aguardando a confirmação.</p>
      <a class="btn" href="/">Voltar à loja</a>
    </div>
    """
    return HTMLResponse(html)

# -----------------------------------------------------------------------------
# Saúde
# -----------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return {"ok": True, "mp": bool(MP_ACCESS_TOKEN), "base_url": MP_BASE_URL}

# -----------------------------------------------------------------------------
# Pedidos do cliente autenticado
# -----------------------------------------------------------------------------
class OrderItemOut(BaseModel):
    name: str
    quantity: int
    unit_price: float

class OrderOut(BaseModel):
    id: int
    status: str
    total_amount: float
    created_at: datetime
    items: List[OrderItemOut] = []
    model_config = {"from_attributes": True}

@app.get("/api/orders/mine", response_model=List[OrderOut])
def my_orders(current=Depends(get_current_user), db: Session = Depends(get_db)):
    orders = (
        db.query(Order)
        .filter(Order.customer_email == current.email)
        .order_by(Order.created_at.desc())
        .all()
    )
    out: List[OrderOut] = []
    for o in orders:
        items = db.query(OrderItem).filter(OrderItem.order_id == o.id).all()
        out.append(
            OrderOut(
                id=o.id,
                status=o.status,
                total_amount=float(o.total_amount),
                created_at=o.created_at,
                items=[
                    OrderItemOut(
                        name=i.name, quantity=i.quantity, unit_price=float(i.unit_price)
                    )
                    for i in items
                ],
            )
        )
    return out

# -----------------------------------------------------------------------------
# ADMIN · CLIENTES
# -----------------------------------------------------------------------------
class UserAdminOut(BaseModel):
    id: int
    name: Optional[str] = ""
    email: EmailStr
    phone: Optional[str] = ""
    is_admin: bool
    created_at: datetime
    doc_type: Optional[str] = None
    doc_number: Optional[str] = None
    cep: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    address: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    model_config = {"from_attributes": True}

class UserAdminCreate(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(..., min_length=6)
    phone: Optional[str] = ""
    doc_type: Optional[str] = None
    doc_number: Optional[str] = None
    cep: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    district: Optional[str] = None
    address: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    is_admin: bool = False

class UserAdminPatch(BaseModel):
    toggle_admin: Optional[bool] = None   # quando True, alterna o is_admin

def _user_to_out(u: User) -> UserAdminOut:
    return UserAdminOut(
        id=u.id, name=u.name, email=u.email, phone=getattr(u, "phone", ""),
        is_admin=u.is_admin, created_at=u.created_at,
        doc_type=getattr(u, "doc_type", None), doc_number=getattr(u, "doc_number", None),
        cep=getattr(u, "cep", None), state=getattr(u, "state", None),
        city=getattr(u, "city", None), district=getattr(u, "district", None),
        address=getattr(u, "address", None), number=getattr(u, "number", None),
        complement=getattr(u, "complement", None),
    )


@app.get("/api/admin/users", response_model=List[UserAdminOut])
def admin_list_users(_: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    return [_user_to_out(u) for u in users]

@app.post("/api/admin/users", response_model=UserAdminOut, status_code=201)
def admin_create_user(payload: UserAdminCreate, _: User = Depends(get_current_admin), db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")
    u = User(
        name=payload.name,
        email=payload.email.lower(),
        password_hash=get_password_hash(payload.password),
        is_admin=payload.is_admin,
        phone=payload.phone,
        doc_type=payload.doc_type,
        doc_number=payload.doc_number,
        cep=payload.cep,
        address=payload.address,
        number=payload.number,
        complement=payload.complement,
        district=payload.district,
        city=payload.city,
        state=(payload.state or "").upper()[:2] if payload.state else None,
    )
    db.add(u); db.commit(); db.refresh(u)
    return _user_to_out(u)


@app.patch("/api/admin/users/{uid}", response_model=UserAdminOut)
def admin_patch_user(
    uid: int,
    payload: UserAdminPatch,
    _: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    if payload.toggle_admin:
        u.is_admin = not bool(u.is_admin)

    db.commit()
    db.refresh(u)
    return _user_to_out(u)
