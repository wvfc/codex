(() => {
  // ===== helpers =====
  const API = location.origin;
  const $  = (s) => document.querySelector(s);

  function getToken() {
    return localStorage.getItem("auth_token") || "";
  }
  function authHeaders(json = true) {
    const h = { Authorization: `Bearer ${getToken()}` };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }
  function goLogin() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("cliente_profile");
    location.href = "/login";
  }

  async function ensureAdmin() {
    const t = getToken();
    if (!t) { goLogin(); return false; }
    try {
      const r = await fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${t}` } });
      if (!r.ok) { goLogin(); return false; }
      const me = await r.json();
      if (!me?.is_admin) {
        alert("Acesso negado. Faça login como administrador.");
        location.href = "/";
        return false;
      }
      // mostra nome no topo (se existir)
      const nameEl = $("#adminUser");
      if (nameEl) nameEl.textContent = me.name || me.email || "Admin";
      return true;
    } catch {
      goLogin();
      return false;
    }
  }

  // ===== render =====
  function row(p) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.id}</td>
      <td>${p.name}</td>
      <td>${p.sku}</td>
      <td>${p.category || ""}</td>
      <td>${(p.tags || []).join(", ")}</td>
      <td>${Number(p.price || 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>
      <td>${p.active ? "✔" : "—"}</td>
      <td style="min-width:140px">
        <button class="btn btn-sm" data-edit="${p.id}">Editar</button>
        <button class="btn btn-sm" data-del="${p.id}">Excluir</button>
      </td>
    `;
    return tr;
  }

  // ===== api =====
  async function listAll() {
    const body = $("#productsBody") || $("#adminList");
    if (!body) return;
    // suporte a tabela (#productsBody) ou cards (#adminList)
    const isTable = body.id === "productsBody";

    body.innerHTML = isTable
      ? `<tr><td colspan="8">Carregando…</td></tr>`
      : "";

    try {
      const r = await fetch(`${API}/api/admin/products`, { headers: authHeaders(false) });
      if (r.status === 401 || r.status === 403) { goLogin(); return; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();

      body.innerHTML = "";
      if (isTable) {
        data.forEach(p => body.appendChild(row(p)));
      } else {
        data.forEach(p => {
          const art = document.createElement("article");
          art.className = "card product";
          art.innerHTML = `
            <div class="img"><img src="${p.image_url || 'https://placehold.co/600x450/png'}" alt="${p.name}"></div>
            <h4>${p.name}</h4>
            <div class="muted">SKU: ${p.sku} · ${p.category || ''}</div>
            <div class="row">
              <strong>${Number(p.price||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</strong>
              <div class="row" style="margin-left:auto;gap:8px">
                <button class="btn" data-edit="${p.id}">Editar</button>
                <button class="btn" data-del="${p.id}">Excluir</button>
              </div>
            </div>`;
          body.appendChild(art);
        });
      }

      // binds
      body.querySelectorAll("[data-del]").forEach(btn => {
        btn.addEventListener("click", () => del(Number(btn.dataset.del)));
      });
      body.querySelectorAll("[data-edit]").forEach(btn => {
        btn.addEventListener("click", () => edit(Number(btn.dataset.edit)));
      });

    } catch (e) {
      if (isTable) body.innerHTML = `<tr><td colspan="8">Erro ao carregar.</td></tr>`;
      else body.innerHTML = `<div class="muted">Erro ao carregar.</div>`;
    }
  }

  async function createOrUpdate(payload, id = null) {
    const method = id ? "PUT" : "POST";
    const url = id ? `${API}/api/admin/products/${id}` : `${API}/api/admin/products`;
    const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) });
    if (res.status === 401 || res.status === 403) { goLogin(); return; }
    if (!res.ok) {
      let msg = "Erro";
      try { const e = await res.json(); msg = e.detail || msg; } catch {}
      alert(msg);
      return;
    }
    await listAll();
  }

  async function del(id) {
    if (!confirm(`Confirma excluir o produto #${id}?`)) return;
    const r = await fetch(`${API}/api/admin/products/${id}`, { method: "DELETE", headers: authHeaders(false) });
    if (r.status === 401 || r.status === 403) { goLogin(); return; }
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      alert("Falha ao excluir: " + (e.detail || r.status));
      return;
    }
    await listAll();
  }

  async function edit(id) {
    // busca lista e preenche o form
    const r = await fetch(`${API}/api/admin/products`, { headers: authHeaders(false) });
    if (!r.ok) { alert("Erro ao carregar produto."); return; }
    const items = await r.json();
    const p = items.find(x => x.id === id);
    if (!p) return;

    $("#p_name")     && ($("#p_name").value = p.name);
    $("#p_sku")      && ($("#p_sku").value = p.sku);
    $("#p_price")    && ($("#p_price").value = p.price);
    $("#p_cat")      && ($("#p_cat").value = p.category || "");
    $("#p_img")      && ($("#p_img").value = p.image_url || "");
    $("#p_tags")     && ($("#p_tags").value = (p.tags || []).join(","));
    $("#p_active")   && ($("#p_active").checked = !!p.active);

    const form = $("#formProduct");
    if (!form) return;

    form.onsubmit = async (e) => {
      e.preventDefault();
      const payload = {
        name:   $("#p_name")?.value?.trim() || "",
        sku:    $("#p_sku")?.value?.trim() || "",
        price:  Number($("#p_price")?.value || 0),
        category: ($("#p_cat")?.value || "").trim(),
        image_url: ($("#p_img")?.value || "").trim(),
        tags: ($("#p_tags")?.value || "").split(",").map(s=>s.trim()).filter(Boolean),
        active: $("#p_active")?.checked ?? true,
      };
      await createOrUpdate(payload, id);
      form.reset();
      form.onsubmit = defaultSubmit; // volta para modo criar
    };
  }

  // submit padrão (criar)
  async function defaultSubmit(e) {
    e.preventDefault();
    const payload = {
      name:   $("#p_name")?.value?.trim() || "",
      sku:    $("#p_sku")?.value?.trim() || "",
      price:  Number($("#p_price")?.value || 0),
      category: ($("#p_cat")?.value || "").trim(),
      image_url: ($("#p_img")?.value || "").trim(),
      tags: ($("#p_tags")?.value || "").split(",").map(s=>s.trim()).filter(Boolean),
      active: $("#p_active")?.checked ?? true,
    };
    if (!payload.name || !payload.sku) { alert("Preencha nome e SKU."); return; }
    await createOrUpdate(payload, null);
    $("#formProduct")?.reset();
  }

  // ===== boot =====
  window.addEventListener("DOMContentLoaded", async () => {
    const ok = await ensureAdmin();
    if (!ok) return;

    // bind form
    const form = $("#formProduct");
    if (form) form.onsubmit = defaultSubmit;

    // listar
    listAll();

    // sair
    $("#btnLogout")?.addEventListener("click", () => {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("cliente_profile");
      location.href = "/login";
    });
  });
})();
(() => {
  // ===== helpers =====
  const API = location.origin;
  const $ = (s) => document.querySelector(s);

  const token = localStorage.getItem("auth_token") || "";
  const authHeaders = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
  const fmtBRL = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  function goLogin() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("cliente_profile");
    location.href = "/login";
  }

  async function ensureAdmin() {
    if (!token) { goLogin(); return false; }
    try {
      const r = await fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) { goLogin(); return false; }
      const me = await r.json();
      if (!me?.is_admin) {
        alert("Acesso negado. Faça login como administrador.");
        location.href = "/";
        return false;
      }
      const nameEl = $("#adminUser");
      if (nameEl) nameEl.textContent = me.name || me.email || "Admin";
      return true;
    } catch { goLogin(); return false; }
  }

  // ===== tabs =====
  function bindTabs() {
    const tabs = document.querySelectorAll(".tabs .tab");
    tabs.forEach(btn => {
      btn.addEventListener("click", () => {
        tabs.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const id = btn.dataset.tab;
        document.querySelectorAll("main .section").forEach(sec => {
          sec.classList.toggle("hidden", sec.id !== id);
        });
      });
    });
  }

  // ==========================================================
  // PRODUTOS
  // ==========================================================
  function rowProduct(p) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.id}</td>
      <td>${p.name}</td>
      <td>${p.sku}</td>
      <td>${p.category || ""}</td>
      <td>${(p.tags || []).join(", ")}</td>
      <td>${fmtBRL(p.price)}</td>
      <td>${p.active ? "✔" : "—"}</td>
      <td class="actions">
        <button class="btn btn-sm" data-del="${p.id}">Excluir</button>
      </td>
    `;
    return tr;
  }

  async function listProducts() {
    const body = $("#productsBody");
    if (!body) return;
    body.innerHTML = `<tr><td colspan="8">Carregando…</td></tr>`;
    try {
      const r = await fetch(`${API}/api/admin/products`, { headers: authHeaders() });
      if (r.status === 401 || r.status === 403) { goLogin(); return; }
      const data = await r.json();
      body.innerHTML = "";
      data.forEach(p => body.appendChild(rowProduct(p)));
      body.querySelectorAll("[data-del]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = Number(btn.dataset.del);
          if (!confirm("Excluir produto #" + id + "?")) return;
          const rr = await fetch(`${API}/api/admin/products/${id}`, { method: "DELETE", headers: authHeaders() });
          if (!rr.ok) { const e = await rr.json().catch(()=>({})); alert(e.detail || "Erro"); return; }
          await listProducts();
        });
      });
    } catch { body.innerHTML = `<tr><td colspan="8">Erro ao carregar.</td></tr>`; }
  }

  async function createProduct() {
    const payload = {
      name: $("#p_name")?.value?.trim() || "",
      sku: $("#p_sku")?.value?.trim() || "",
      price: Number($("#p_price")?.value || 0),
      category: $("#p_cat")?.value?.trim() || "",
      tags: ($("#p_tags")?.value || "").split(",").map(s=>s.trim()).filter(Boolean),
      image_url: $("#p_img")?.value?.trim() || "",
      active: $("#p_active")?.checked ?? true,
    };
    if (!payload.name || !payload.sku) { alert("Nome e SKU são obrigatórios."); return; }
    const r = await fetch(`${API}/api/admin/products`, { method:"POST", headers:authHeaders(), body:JSON.stringify(payload) });
    if (!r.ok) { const e = await r.json().catch(()=>({})); alert(e.detail || "Erro"); return; }
    ["p_name","p_sku","p_price","p_cat","p_tags","p_img"].forEach(id => { const el = $("#"+id); if (el) el.value=""; });
    $("#p_active") && ($("#p_active").checked = true);
    await listProducts();
    alert("Produto salvo!");
  }

  // ==========================================================
  // CLIENTES
  // (Necessita rotas no backend: 
  //   GET   /api/admin/users
  //   POST  /api/admin/users
  //   PATCH /api/admin/users/{id}  (ex.: {is_admin:true/false})
  // )
  // ==========================================================
  function rowUser(u) {
    const address = [
      u.address_street && `${u.address_street}, ${u.address_number || ""}`.trim(),
      u.address_district,
      u.address_city && `${u.address_city}-${u.address_state || ""}`.trim(),
      u.address_zip
    ].filter(Boolean).join(" · ");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.id}</td>
      <td>${u.name || "—"}</td>
      <td>${u.email}</td>
      <td>${[u.doc_type, u.doc_number].filter(Boolean).join(" ") || "—"}</td>
      <td>${u.phone || "—"}</td>
      <td class="muted">${address || "—"}</td>
      <td>${u.is_admin ? "✔" : "—"}</td>
      <td class="actions">
        <button class="btn btn-sm" data-toggle="${u.id}">${u.is_admin ? "Remover admin" : "Tornar admin"}</button>
      </td>
    `;
    return tr;
  }

  async function listUsers() {
    const body = $("#usersBody");
    const info = $("#usersInfo");
    if (!body) return;
    body.innerHTML = `<tr><td colspan="8">Carregando…</td></tr>`;
    try {
      const r = await fetch(`${API}/api/admin/users`, { headers: authHeaders() });
      if (r.status === 401 || r.status === 403) { goLogin(); return; }
      const data = await r.json();
      info.textContent = `${data.length} cliente(s)`;
      body.innerHTML = "";
      data.forEach(u => body.appendChild(rowUser(u)));
      body.querySelectorAll("[data-toggle]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const id = Number(btn.dataset.toggle);
          const rr = await fetch(`${API}/api/admin/users/${id}`, { method:"PATCH", headers:authHeaders(), body:JSON.stringify({ toggle_admin: true }) });
          if (!rr.ok) { const e = await rr.json().catch(()=>({})); alert(e.detail || "Erro"); return; }
          await listUsers();
        });
      });
    } catch { body.innerHTML = `<tr><td colspan="8">Erro ao carregar.</td></tr>`; }
  }

  async function createUser() {
    const payload = {
      name: $("#c_name")?.value?.trim() || "",
      email: $("#c_email")?.value?.trim() || "",
      phone: $("#c_phone")?.value?.trim() || "",
      doc_type: $("#c_doc_type")?.value || "CPF",
      doc_number: $("#c_doc_number")?.value?.replace(/\D/g,"") || "",
      password: $("#c_password")?.value || "",
      address_zip: $("#c_zip")?.value || "",
      address_state: $("#c_state")?.value || "",
      address_city: $("#c_city")?.value || "",
      address_district: $("#c_district")?.value || "",
      address_street: $("#c_street")?.value || "",
      address_number: $("#c_number")?.value || "",
      address_complement: $("#c_complement")?.value || "",
      is_admin: $("#c_is_admin")?.checked || false,
    };
    if (!payload.name || !payload.email || payload.password.length < 6) {
      alert("Preencha nome, e-mail e uma senha (mín. 6).");
      return;
    }
    const r = await fetch(`${API}/api/admin/users`, { method:"POST", headers:authHeaders(), body:JSON.stringify(payload) });
    if (!r.ok) { const e = await r.json().catch(()=>({})); alert(e.detail || "Erro"); return; }
    alert("Cliente criado com sucesso!");
    // limpa form
    ["c_name","c_email","c_phone","c_doc_number","c_password","c_zip","c_state","c_city","c_district","c_street","c_number","c_complement"].forEach(id=>{
      const el=$("#"+id); if(el) el.value="";
    });
    $("#c_is_admin") && ($("#c_is_admin").checked=false);
    await listUsers();
  }

  // ==========================================================
  // BOOT
  // ==========================================================
  window.addEventListener("DOMContentLoaded", async () => {
    bindTabs();

    const ok = await ensureAdmin();
    if (!ok) return;

    // Produtos
    await listProducts();
    $("#btnSave")?.addEventListener("click", createProduct);

    // Clientes
    await listUsers();
    $("#btnCreateCustomer")?.addEventListener("click", createUser);

    // Sair
    $("#btnLogout")?.addEventListener("click", () => {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("cliente_profile");
      location.href = "/login";
    });
  });
})();
