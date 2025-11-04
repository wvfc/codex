/***** SOUTECH Store – app.js (corrigido) *****/
const API = location.origin;
const CART_KEY = "soutech_cart_v1";

/* helpers */
const $  = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
const fmtBRL = (n)=>Number(n||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

/* auth */
const getToken = ()=> localStorage.getItem("auth_token") || "";

async function fetchMe() {
  const t = getToken();
  if (!t) return null;
  try {
    const r = await fetch(`${API}/api/auth/me`, { headers:{ Authorization:`Bearer ${t}` } });
    if (!r.ok) return null;
    return await r.json(); // {id,name,email,is_admin,...}
  } catch { return null; }
}

async function ensureHeaderUserPill(){
  const me = await fetchMe();
  const pill = $("#myAccountLink"), nm = $("#userName");
  if (me && pill && nm) {
    nm.textContent = me.name || me.email || "Minha conta";
    pill.style.display = "inline-flex";
  } else {
    // sem login, mostra o link "Entrar"
    const loginLink = $("#loginLink");
    if (loginLink) loginLink.style.display = "inline-flex";
  }
}

/* cart */
function getCart(){ try{ return JSON.parse(localStorage.getItem(CART_KEY))||[] }catch{ return [] } }
function saveCart(cart){ localStorage.setItem(CART_KEY, JSON.stringify(cart)); renderCart(); renderCartIconCount(); }
function renderCartIconCount(){ const el=$("#cartCount"); if(el) el.textContent = getCart().reduce((s,i)=>s+(i.qty||0),0); }
function addToCart(p, qty=1){
  const c=getCart(); const i=c.findIndex(x=>x.id===p.id);
  if(i>=0) c[i].qty+=qty; else c.push({id:p.id,name:p.name,sku:p.sku,price:Number(p.price),image_url:p.image_url||"",qty});
  saveCart(c); openCart();
}
function removeFromCart(id){ saveCart(getCart().filter(i=>i.id!==id)); }
function updateQty(id,q){ const c=getCart(); const it=c.find(i=>i.id===id); if(!it) return; it.qty=Math.max(1,Number(q||1)); saveCart(c); }
function cartTotals(){
  const c=getCart(); const subtotal=c.reduce((s,i)=>s+Number(i.price||0)*Number(i.qty||0),0);
  return {subtotal,total:subtotal};
}

/* drawer */
function openCart(){ const c=$("#cart"), o=$("#overlay"); if(!c||!o) return; c.classList.add("open"); o.classList.add("show"); o.removeAttribute("hidden"); document.documentElement.style.overflow="hidden"; document.body.style.overflow="hidden"; renderCart(); }
function closeCart(){ const c=$("#cart"), o=$("#overlay"); if(!c||!o) return; c.classList.remove("open"); o.classList.remove("show"); o.setAttribute("hidden",""); document.documentElement.style.overflow=""; document.body.style.overflow=""; }

/* render carrinho */
function renderCart(){
  const list=$("#cartItems"); if(!list) return;
  list.innerHTML="";
  const cart=getCart();
  cart.forEach(i=>{
    const line=Number(i.price)*Number(i.qty);
    const li=document.createElement("li"); li.className="cart-item";
    li.innerHTML=`
      <img src="${i.image_url || "https://placehold.co/80x80"}" alt="">
      <div>
        <div class="row" style="justify-content:space-between">
          <strong>${i.name}</strong>
          <button class="btn" data-remove="${i.id}" type="button">Remover</button>
        </div>
        <div class="muted">${i.sku || ""}</div>
        <div class="row" style="margin-top:6px">
          <input type="number" min="1" value="${i.qty}" class="qty" data-id="${i.id}">
          <div style="margin-left:auto"><strong>${fmtBRL(line)}</strong></div>
        </div>
      </div>`;
    list.appendChild(li);
  });
  const {subtotal,total}=cartTotals();
  $("#subtotal") && ($("#subtotal").textContent=fmtBRL(subtotal));
  $("#total")    && ($("#total").textContent=fmtBRL(total));
  list.querySelectorAll("[data-remove]").forEach(b=>b.addEventListener("click",()=>removeFromCart(Number(b.dataset.remove))));
  list.querySelectorAll("input.qty").forEach(inp=>inp.addEventListener("change",()=>updateQty(Number(inp.dataset.id), Number(inp.value))));
}

/* produtos */
const state={pagina:1, porPagina:8, filtro:{q:"", cat:"", ord:"nome-asc"}};

async function fetchProducts(){
  const p=new URLSearchParams();
  if(state.filtro.q)   p.set("q", state.filtro.q);
  if(state.filtro.cat) p.set("category", state.filtro.cat);
  try{
    const r=await fetch(`${API}/api/products?${p.toString()}`);
    return r.ok? await r.json():[];
  }catch{
    return [];
  }
}

function applySort(list){
  switch(state.filtro.ord){
    case "preco-asc":  return list.sort((a,b)=>(a.price??0)-(b.price??0));
    case "preco-desc": return list.sort((a,b)=>(b.price??0)-(a.price??0));
    case "novidades":  return list.sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));
    default:           return list.sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  }
}
function paginate(list){ const s=(state.pagina-1)*state.porPagina; return list.slice(s,s+state.porPagina); }

function productCardHTML(p){
  const img=(p.image_url && typeof p.image_url==="string") ? p.image_url : "https://placehold.co/300x300/png";
  return `
    <div class="product-thumb"><img src="${img}" alt="${p.name||"Produto"}" loading="lazy"></div>
    <div class="body">
      <h3>${p.name||"Produto"}</h3>
      <div class="row">
        <span class="muted">SKU: ${p.sku||"—"}</span>
        <span class="badge" style="margin-left:auto">${p.category||""}</span>
      </div>
      <div class="row">
        <strong>${fmtBRL(p.price)}</strong>
        <button class="btn brand" data-add="${p.id}" style="margin-left:auto">Adicionar</button>
      </div>
    </div>`;
}

async function renderProdutos(){
  const grid=$("#lista"); if(!grid) return; grid.innerHTML="";
  let items=applySort(await fetchProducts());
  $("#resultInfo") && ($("#resultInfo").textContent = `${items.length} produto(s)`);
  if(!items.length){
    const d=document.createElement("div"); d.className="card"; d.textContent="Nenhum produto encontrado.";
    grid.appendChild(d); renderPaginacao(0); return;
  }
  const page=paginate(items);
  page.forEach(p=>{
    const card=document.createElement("article");
    card.className="card";
    card.innerHTML=productCardHTML(p);
    grid.appendChild(card);
  });
  grid.querySelectorAll("[data-add]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id=Number(btn.dataset.add);
      const p=items.find(x=>x.id===id);
      if(p) addToCart(p,1);
    });
  });
  renderPaginacao(items.length);
}

function renderPaginacao(total){
  const bar=$("#paginacao"); if(!bar) return; bar.innerHTML="";
  const pages=Math.max(1, Math.ceil(total/state.porPagina));
  for(let i=1;i<=pages;i++){
    const b=document.createElement("button");
    b.className="btn"+(i===state.pagina?" active":"");
    b.textContent=i;
    b.addEventListener("click",()=>{ state.pagina=i; renderProdutos(); window.scrollTo({top:0,behavior:"smooth"}); });
    bar.appendChild(b);
  }
}

/* checkout: pega o usuário do backend na hora */
async function finalizarCompra() {
  const cart = getCart();
  if (!cart.length) { alert("Carrinho vazio!"); return; }

  const me = await fetchMe();
  if (!me) { alert("Faça login para finalizar a compra."); location.href="/login"; return; }

  const payload = {
    items: cart.map(i => ({ product_id: i.id, quantity: i.qty }))
  };

  const btn = $("#btnCheckout"); if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${API}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization": `Bearer ${getToken()}` },
      body: JSON.stringify(payload),
    });

    if (res.status === 401 || res.status === 403) {
      alert("Sua sessão expirou. Entre novamente.");
      localStorage.removeItem("auth_token"); localStorage.removeItem("auth_user");
      location.href = "/login"; return;
    }
    if (!res.ok) {
      let msg = `Erro ${res.status}`; try{ const d=await res.json(); msg=d.detail||msg; }catch{};
      alert(msg); return;
    }
    const data = await res.json();
    if (!data.checkout_url) { alert("Não foi possível iniciar o pagamento."); return; }
    location.href = data.checkout_url;
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* boot */
window.addEventListener("DOMContentLoaded", async ()=>{
  // filtros
  $("#btnAplicarFiltros")?.addEventListener("click", ()=>{
    state.filtro.q   = $("#q")?.value?.trim() || "";
    state.filtro.cat = $("#categoria")?.value || "";
    state.filtro.ord = $("#ordenar")?.value || "nome-asc";
    state.pagina=1; renderProdutos();
  });

  $$('[data-open-cart]').forEach(el=>el.addEventListener("click", openCart));
  $$('[data-close-cart]').forEach(el=>el.addEventListener("click", closeCart));
  $("#overlay")?.addEventListener("click", closeCart);
  $("#btnCheckout")?.addEventListener("click", finalizarCompra);

  // mostra/oculta botão de finalizar baseado em sessão *válida*
  const me = await fetchMe();
  if (me) {
    $("#btnCheckout")?.removeAttribute("hidden");
    if ($("#btnLoginToCheckout")) $("#btnLoginToCheckout").style.display = "none";
  } else {
    $("#btnCheckout")?.setAttribute("hidden", "true");
    if ($("#btnLoginToCheckout")) $("#btnLoginToCheckout").style.display = "inline-flex";
  }

  renderCart(); renderCartIconCount();
  await ensureHeaderUserPill();
  renderProdutos();

  const y=$("#year"); if(y) y.textContent=new Date().getFullYear();
});
