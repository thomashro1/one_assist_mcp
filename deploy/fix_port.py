import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('dedi571.your-server.de', port=222, username='carecp', password='j6#Hv$!QH*b+', timeout=15)

def run(cmd):
    _, out, err = c.exec_command(cmd)
    r = (out.read() + err.read()).decode('utf-8', errors='replace').strip()
    print(f'$ {cmd}\n{r}\n')
    return r

# Was ist auf Port 3010?
run('ss -tlnp | grep 3010')
run('fuser 3010/tcp 2>/dev/null || echo "fuser not available"')

# Freien Port finden (3012, 3015, 3020...)
for port in [3012, 3015, 3018, 3020, 3025]:
    result = run(f'ss -tlnp | grep :{port} || echo "PORT_{port}_FREE"')
    if f'PORT_{port}_FREE' in result:
        print(f'>>> Freier Port: {port}')
        break

# PM2 mit neuem Port starten
run('pm2 delete one-assist-mcp 2>/dev/null || true')
run('cd /usr/home/carecp/one_assist_mcp && PORT=3012 pm2 start server-http.js --name one-assist-mcp')
run('pm2 save')
import time; time.sleep(2)
run('curl -s http://127.0.0.1:3012/health')

c.close()
