
@echo off
setlocal

rem === CREDENCIAIS DO MERCADO PAGO (NÃO COMMITAR EM GIT) ===
set "MP_ACCESS_TOKEN=APP_USR-155371853664076-110121-952f4da1831d368a63f18bdd898e18cb-265340163"
set "MP_PUBLIC_KEY=APP_USR-71f7316d-8645-4c70-a7b5-a48f2b76d3bb"
set "BASE_URL=https://airvision.soutechautomacao.com/"

rem === VÁ PARA A PASTA DO PROJETO (ATENÇÃO: HÁ ESPAÇOS NO CAMINHO) ===
cd /d "C:\Users\Walte\OneDrive\Desktop\PROJETOS SOUTECH\tst"

rem === ATIVE O VENV (dentro de .bat use CALL e .bat) ===
call ".venv\Scripts\activate.bat"

rem (opcional) garanti dependências:
rem python -m pip install -r requirements.txt

rem === SUBA O FASTAPI ===
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload

endlocal
