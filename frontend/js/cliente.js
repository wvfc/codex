(() => {
  // ===== Config / Helpers =====
  const API = location.origin;
  const $ = (s) => document.querySelector(s);
  const fmtBRL = (n) =>
    Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const brDate = (iso) => {
    try { return new Date(iso).toLocaleString("pt-BR"); } catch { return "—"; }
  };
  const getToken = () => localStorage.getItem("auth_token") || "";

  // ===== Auth guard =====
  const token = getToken();
  if (!token) {
    location.href = "/login";
    return;
  }

  // ===== Perfil =====
  async function loadProfile() {
    const res = await fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      // token inválido/expirado → volta ao login
      localStorage.removeItem("auth_token");
      localStorage.removeItem("cliente_profile");
      location.href = "/login";
      return;
    }

    const me = await res.json();
    localStorage.setItem("cliente_profile", JSON.stringify(me));

    // Cabeçalho de boas-vindas
    $("#hello") && ($("#hello").textContent = `Olá, ${me.name || me.email || ""}!`);

    // Cartões
    $("#clientName")   && ($("#clientName").textContent = me.name || "—");
    $("#clientEmail")  && ($("#clientEmail").textContent = me.email || "—");
    $("#clientCreated")&& ($("#clientCreated").textContent = brDate(me.created_at));

    // Badge admin + link
    const badge = $("#isAdminBadge");
    if (badge) {
      if (me.is_admin) {
        badge.textContent = "admin";
        badge.classList.add("ok");
        $("#adminLinkWrap")?.classList.remove("hidden"); // mostra botão Admin
      } else {
        badge.textContent = "cliente";
        badge.classList.remove("ok");
        $("#adminLinkWrap")?.classList.add("hidden");
      }
    }
  }

  // ===== Pedidos do usuário (opcional) =====
  // Esperado do backend: GET /api/orders/mine -> [{ id, status, total_amount, created_at, items:[{name,quantity,unit_price}] }]
  async function loadOrders() {
    const info = $("#ordersInfo");
    const box  = $("#ordersBox");
    if (!info || !box) return; // página sem seção de pedidos

    try {
      const res = await fetch(`${API}/api/orders/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) { info.textContent = "—"; return; }

      const list = await res.json();
      info.textContent = `${list.length} pedido(s)`;
      if (!list.length) return;

      const wrap = document.createElement("div");
      wrap.style.overflowX = "auto";
      const table = document.createElement("table");
      table.className = "table";
      table.innerHTML = `
        <thead>
          <tr><th>#</th><th>Status</th><th>Data</th><th>Total</th><th>Itens</th></tr>
        </thead>
        <tbody id="ordersBody"></tbody>
      `;
      wrap.appendChild(table);
      box.innerHTML = "";
      box.appendChild(wrap);

      const tbody = $("#ordersBody");
      list.forEach(o => {
        const tr = document.createElement("tr");
        const items = (o.items || []).map(i => `${i.quantity}× ${i.name}`).join(", ");
        tr.innerHTML = `
          <td>${o.id}</td>
          <td>${o.status || "-"}</td>
          <td>${o.created_at ? new Date(o.created_at).toLocaleString("pt-BR") : "-"}</td>
          <td><strong>${fmtBRL(o.total_amount)}</strong></td>
          <td class="muted">${items || "—"}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch {
      /* silencioso */
    }
  }

  // ===== Ações UI =====
  $("#btnLogout")?.addEventListener("click", () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("cliente_profile");
    location.href = "/login";
  });

  $("#copyMail")?.addEventListener("click", async () => {
    const mail = $("#clientEmail")?.textContent?.trim() || "";
    try {
      await navigator.clipboard.writeText(mail);
      $("#copyMail").textContent = "Copiado!";
      setTimeout(() => ($("#copyMail").textContent = "Copiar e-mail"), 1200);
    } catch {
      alert("Não foi possível copiar.");
    }
  });

  // ===== Boot =====
  window.addEventListener("DOMContentLoaded", async () => {
    // ano no rodapé, se existir
    const y = $("#year"); if (y) y.textContent = new Date().getFullYear();

    // usa cache local para não piscar vazio
    try {
      const cache = JSON.parse(localStorage.getItem("cliente_profile") || "{}");
      if (cache && (cache.name || cache.email)) {
        $("#hello") && ($("#hello").textContent = `Olá, ${cache.name || cache.email}!`);
        $("#clientName")   && ($("#clientName").textContent = cache.name || "—");
        $("#clientEmail")  && ($("#clientEmail").textContent = cache.email || "—");
        $("#clientCreated")&& ($("#clientCreated").textContent = brDate(cache.created_at));
        if (cache.is_admin) {
          $("#isAdminBadge")?.classList.add("ok");
          $("#isAdminBadge") && ($("#isAdminBadge").textContent = "admin");
          $("#adminLinkWrap")?.classList.remove("hidden");
        }
      }
    } catch {}

    await loadProfile(); // garante dados atualizados do /me
    await loadOrders();  // se existir seção de pedidos
  });
})();
