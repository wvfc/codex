const API = location.origin;

document.getElementById('formSignup').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const name = document.getElementById('s_name').value.trim();
  const email = document.getElementById('s_email').value.trim();
  const password = document.getElementById('s_password').value;
  const password2 = document.getElementById('s_password2').value;
  if(password!==password2){ document.getElementById('signupMsg').textContent='Senhas não conferem.'; return; }
  const res = await fetch(`${API}/api/auth/signup`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name,email,password})
  });
  if(!res.ok){ const e = await res.json().catch(()=>({detail:'Erro'})); document.getElementById('signupMsg').textContent = e.detail || 'Erro'; return; }
  document.getElementById('signupMsg').textContent = 'Conta criada! Agora faça login.';
  e.target.reset();
});

document.getElementById('formLogin').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = document.getElementById('l_email').value.trim();
  const password = document.getElementById('l_password').value;
  const res = await fetch(`${API}/api/auth/login`, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email,password})
  });
  if(!res.ok){ const e = await res.json().catch(()=>({detail:'Erro'})); document.getElementById('loginMsg').textContent = e.detail || 'Erro'; return; }
  const data = await res.json();
  localStorage.setItem('token', data.access_token);
  // Check if admin to route to /admin, else back to /
  try{
    const me = await fetch(`${API}/api/auth/me`, { headers: { 'Authorization': `Bearer ${data.access_token}` } });
    const u = await me.json();
    if(u.is_admin) location.href='/admin';
    else location.href='/';
  }catch(_){
    location.href='/';
  }
});