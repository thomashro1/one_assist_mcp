import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('dedi571.your-server.de', port=222, username='carecp', password='j6#Hv$!QH*b+', timeout=15)

for cmd in [
    'pm2 logs one-assist-mcp --lines 30 --nostream 2>&1',
    'ls /usr/home/carecp/.pm2/logs/ | grep one-assist',
]:
    _, out, err = c.exec_command(cmd)
    print(f'$ {cmd}')
    print((out.read() + err.read()).decode('utf-8', errors='replace'))

c.close()
