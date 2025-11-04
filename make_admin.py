# make_admin.py
import sqlite3, sys, os
EMAIL = (sys.argv[1] if len(sys.argv) > 1 else "").strip().lower()
if not EMAIL:
    print("Uso: python make_admin.py email@dominio.com"); raise SystemExit(1)
DB = os.path.abspath("soutech.db")
con = sqlite3.connect(DB); cur = con.cursor()
cur.execute("UPDATE users SET is_admin=1 WHERE email=?", (EMAIL,))
if cur.rowcount == 0:
    print("Nenhum usuário com esse e-mail."); con.close(); raise SystemExit(2)
con.commit(); con.close()
print("✅ Promovido a admin:", EMAIL, "no banco:", DB)
