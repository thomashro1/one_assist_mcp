import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('dedi571.your-server.de', port=222, username='carecp', password='j6#Hv$!QH*b+', timeout=15)

def run(cmd):
    _, out, err = c.exec_command(cmd)
    r = (out.read() + err.read()).decode('utf-8', errors='replace').strip()
    print(f'$ {cmd}\n{r}\n')

run('curl -s http://127.0.0.1:3012/health')
run('curl -sk https://carecore.one/mcp/health')

# MCP Initialize-Request testen
run('''curl -s -X POST http://127.0.0.1:3012/ \
  -H "Content-Type: application/json" \
  -d \'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}\' ''')

c.close()
