"""
Deployed one_assist_mcp auf dedi571 und startet via PM2.
Aufruf: python deploy/deploy.py
"""
import paramiko, paramiko.sftp_client, os, posixpath, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

HOST    = 'dedi571.your-server.de'
PORT    = 222
USER    = 'carecp'
PASS    = 'j6#Hv$!QH*b+'
REMOTE  = '/usr/home/carecp/one_assist_mcp'
PROXY   = '/usr/home/carecp/public_html/mcp'

LOCAL   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

UPLOAD_FILES = [
    'package.json',
    'config.js',
    'state.js',
    'server-factory.js',
    'server-http.js',
    'tools/rezept.js',
    'tools/suche.js',
    'tools/auftrag.js',
    'tools/produkt.js',
    'tools/auth.js',
]

def ssh_run(c, cmd):
    _, out, err = c.exec_command(cmd)
    result = (out.read() + err.read()).decode('utf-8', errors='replace').strip()
    print(f'  $ {cmd}\n  {result}' if result else f'  $ {cmd}')
    return result

def upload(sftp, local_rel, remote_base):
    local_path  = os.path.join(LOCAL, local_rel.replace('/', os.sep))
    remote_path = posixpath.join(remote_base, local_rel)
    remote_dir  = posixpath.dirname(remote_path)
    try: sftp.mkdir(remote_dir)
    except: pass
    sftp.put(local_path, remote_path)
    print(f'  UP {local_rel}')

def main():
    print('=== one-assist MCP Deploy ===')
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)
    sftp = c.open_sftp()

    # Zielverzeichnisse anlegen
    for d in [REMOTE, f'{REMOTE}/tools', PROXY]:
        try: sftp.mkdir(d)
        except: pass

    # Dateien hochladen
    print('\n--- Dateien hochladen ---')
    for f in UPLOAD_FILES:
        upload(sftp, f, REMOTE)

    # .htaccess für Reverse Proxy anlegen
    print('\n--- Proxy .htaccess ---')
    htaccess = (
        'Options -Indexes\n'
        '<IfModule mod_rewrite.c>\n'
        '  RewriteEngine On\n'
        '  RewriteRule ^(.*)$ http://127.0.0.1:3012/$1 [P,L]\n'
        '</IfModule>\n'
    )
    with sftp.open(f'{PROXY}/.htaccess', 'w') as fh:
        fh.write(htaccess)
    print('  UP mcp/.htaccess')

    sftp.close()

    # npm install + PM2
    print('\n--- npm install ---')
    ssh_run(c, f'cd {REMOTE} && npm install --omit=dev 2>&1 | tail -3')

    print('\n--- PM2 ---')
    ssh_run(c, f'pm2 delete one-assist-mcp 2>/dev/null; true')
    ssh_run(c, f'cd {REMOTE} && pm2 start server-http.js --name one-assist-mcp --env production')
    ssh_run(c, 'pm2 save')
    ssh_run(c, 'pm2 list')

    print('\n--- Health-Check ---')
    ssh_run(c, 'curl -s http://127.0.0.1:3010/health')

    c.close()
    print('\n=== Deploy fertig ===')
    print('MCP-URL: https://carecore.one/mcp/sse')

if __name__ == '__main__':
    main()
