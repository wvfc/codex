/***** SOUTECH – login.js *****/
const API = location.origin;

const $ = (s)=>document.querySelector(s);

async function doLogin(e){
  e.preventDefault();
  const email = $("#email")?.value?.trim();
  const password = $("#password")?.value || "";
  if(!email || !password){ alert("Preencha e-mail e senha."); return; }

  const btn = $("#btnLogin"); if (btn) btn.disabled = true;

  try{
    const r = await fetch(`${API}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ email, password })
    });

    if(!r.ok){
      let msg=`Erro ${r.status}`;
      try{ const d=await r.json(); msg=d.detail||msg; }catch{}
      alert(msg); return;
    }

    const data = await r.json(); // { access_token, token_type }
    if(!data?.access_token){ alert("Falha ao autenticar."); return; }

    localStorage.setItem("auth_token", data.access_token);
    // opcional: guardar nome/email retornados pelo /me após login
    try{
      const meRes = await fetch(`${API}/api/auth/me`, { headers:{ Authorization:`Bearer ${data.access_token}` } });
      if(meRes.ok){
        const me = await meRes.json();
        localStorage.setItem("auth_user", JSON.stringify(me));
      }
    }catch{}

    location.href = "/"; // volta para a loja logado
  } finally {
    if (btn) btn.disabled = false;
  }
}

window.addEventListener("DOMContentLoaded", ()=>{
  $("#formLogin")?.addEventListener("submit", doLogin);
});
