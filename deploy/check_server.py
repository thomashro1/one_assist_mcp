import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8')

HOST = 'dedi571.your-server.de'
PORT = 222
USER = 'carecp'
PASS = 'j6#Hv$!QH*b+'

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)

cmds = [
    'pm2 list 2>/dev/null || echo NO_PM2',
    'ls /etc/apache2/mods-enabled/ 2>/dev/null | grep proxy || echo NO_PROXY_MODS',
    'ss -tlnp | grep 127.0.0.1',
]

for cmd in cmds:
    _, out, err = c.exec_command(cmd)
    result = (out.read() + err.read()).decode('utf-8', errors='replace').strip()
    print(f'$ {cmd}')
    print(result)
    print()

c.close()
