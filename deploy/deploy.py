"""
Deployed one_assist_mcp v2 (mit OAuth-Login) auf dedi571.
Aufruf: python deploy/deploy.py

Ablauf:
  1. mcp_auth.php nach public_html/one_assist/api/
  2. MCP_INTERNAL_TOKEN sicherstellen (himi10_db.local.ini + config.js)
  3. Node-Files nach /usr/home/carecp/one_assist_mcp/
  4. Proxy .htaccess unter public_html/mcp/ setzen
  5. npm install --omit=dev
  6. PM2 restart

Nicht mitgepushter Server-State:
  - OPENAI_API_KEY  (via deploy/set_env.py)
  - MCP_INTERNAL_TOKEN (dieses Script, einmalig generiert und persistiert)
"""
import paramiko, os, posixpath, secrets, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
sys.stderr.reconfigure(encoding='utf-8', errors='replace')

HOST         = 'dedi571.your-server.de'
PORT         = 222
USER         = 'carecp'
PASS         = 'j6#Hv$!QH*b+'
REMOTE_NODE  = '/usr/home/carecp/one_assist_mcp'
PROXY_DIR    = '/usr/home/carecp/public_html/mcp'
WEB_API_DIR  = '/usr/home/carecp/public_html/one_assist/api'
MANAGER_DIR  = '/usr/home/carecp/public_html/one_assist/manager'

LOCAL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NODE_FILES = [
    'package.json',
    'config.js',
    'server-factory.js',
    'server-http.js',
    'oauth.js',
    'user_auth.js',
    'upload.js',
    'upload_html.js',
    'index.js',
    'tools/rezept.js',
    'tools/suche.js',
    'tools/suche_klassisch.js',
    'tools/auftrag.js',
    'tools/produkt.js',
]


def ssh_run(c, cmd):
    _, out, err = c.exec_command(cmd)
    result = (out.read() + err.read()).decode('utf-8', errors='replace').strip()
    print(f'  $ {cmd}\n  {result}' if result else f'  $ {cmd}')
    return result


def upload(sftp, local_rel, remote_base):
    local_path  = os.path.join(LOCAL, local_rel.replace('/', os.sep))
    remote_path = posixpath.join(remote_base, local_rel)
    try: sftp.mkdir(posixpath.dirname(remote_path))
    except: pass
    sftp.put(local_path, remote_path)
    print(f'  UP {local_rel}')


def read_remote(sftp, path):
    try:
        with sftp.open(path, 'r') as f:
            return f.read().decode('utf-8', errors='replace')
    except IOError:
        return None


def write_remote(sftp, path, content):
    with sftp.open(path, 'w') as f:
        f.write(content)


def ensure_mcp_internal_token(sftp):
    """Sorgt dafuer, dass MCP_INTERNAL_TOKEN in himi10_db.local.ini und in
    config.js identisch gesetzt ist. Generiert einen neuen, wenn keiner
    vorhanden ist."""
    ini_path = f'{MANAGER_DIR}/himi10_db.local.ini'
    cfg_path = f'{REMOTE_NODE}/config.js'

    ini_content = read_remote(sftp, ini_path) or ''
    token = None
    for line in ini_content.splitlines():
        s = line.strip()
        if s.startswith('MCP_INTERNAL_TOKEN'):
            _, _, val = s.partition('=')
            token = val.strip().strip('"').strip("'")
            break

    if not token:
        token = secrets.token_urlsafe(48)
        print(f'  neuer MCP_INTERNAL_TOKEN generiert (Laenge {len(token)})')
        if ini_content and not ini_content.endswith('\n'):
            ini_content += '\n'
        ini_content += f'MCP_INTERNAL_TOKEN = "{token}"\n'
        write_remote(sftp, ini_path, ini_content)
        print(f'  UP {ini_path}')
    else:
        print('  MCP_INTERNAL_TOKEN bereits gesetzt in himi10_db.local.ini')

    cfg_content = read_remote(sftp, cfg_path)
    if cfg_content is None:
        print('  WARN: config.js noch nicht auf Server — Token wird beim naechsten Deploy eingebettet')
        return token

    marker_old = "MCP_INTERNAL_TOKEN: process.env.MCP_INTERNAL_TOKEN || ''"
    marker_new = f"MCP_INTERNAL_TOKEN: process.env.MCP_INTERNAL_TOKEN || '{token}'"
    if marker_old in cfg_content:
        cfg_content = cfg_content.replace(marker_old, marker_new)
        write_remote(sftp, cfg_path, cfg_content)
        print('  MCP_INTERNAL_TOKEN in config.js eingebettet')
    return token


def main():
    print('=== one-assist MCP v2 Deploy ===')
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)
    sftp = c.open_sftp()

    for d in [REMOTE_NODE, f'{REMOTE_NODE}/tools', PROXY_DIR]:
        try: sftp.mkdir(d)
        except: pass

    # 1) PHP-Endpoint (liegt im one_assist_web-Repo, nicht im MCP-Repo)
    print('\n--- PHP: mcp_auth.php ---')
    php_local  = r'C:/Projekte/one_assist_web/api/mcp_auth.php'
    php_remote = f'{WEB_API_DIR}/mcp_auth.php'
    try: sftp.mkdir(WEB_API_DIR)
    except: pass
    sftp.put(php_local, php_remote)
    print(f'  UP {php_remote}')

    # 2) Node-Files
    print('\n--- Node-Files ---')
    for f in NODE_FILES:
        upload(sftp, f, REMOTE_NODE)

    # Alte Files aufraeumen (state.js, tools/auth.js sind obsolet)
    for stale in ['state.js', 'tools/auth.js']:
        try:
            sftp.remove(f'{REMOTE_NODE}/{stale}')
            print(f'  RM {stale}')
        except IOError:
            pass

    # 3a) Proxy .htaccess (leitet ALLES unter /mcp/ an Node weiter)
    print('\n--- Proxy .htaccess ---')
    htaccess_mcp = (
        'Options -Indexes\n'
        '<IfModule mod_rewrite.c>\n'
        '  RewriteEngine On\n'
        '  RewriteRule ^(.*)$ http://127.0.0.1:3012/$1 [P,L]\n'
        '</IfModule>\n'
    )
    with sftp.open(f'{PROXY_DIR}/.htaccess', 'w') as fh:
        fh.write(htaccess_mcp)
    print('  UP mcp/.htaccess')

    # 3b) Root-Level /.well-known/-Discovery an Node weiterleiten (claude.ai probiert
    # /.well-known/oauth-authorization-server und /.well-known/oauth-protected-resource[/mcp[/api]]
    # nach RFC 8414/9728 bevor der /mcp/-Pfad ausprobiert wird).
    print('\n--- .well-known/.htaccess ---')
    wk_dir = '/usr/home/carecp/public_html/.well-known'
    try: sftp.mkdir(wk_dir)
    except IOError: pass
    htaccess_wk = (
        'Options -Indexes\n'
        '<IfModule mod_rewrite.c>\n'
        '  RewriteEngine On\n'
        '  # Nur OAuth-Metadaten-Pfade an Node proxien; ACME/andere .well-known-Requests\n'
        '  # bleiben unangefasst (fallen dann auf 404 vom Server zurück).\n'
        '  RewriteRule ^oauth-protected-resource(/.*)?$   http://127.0.0.1:3012/.well-known/oauth-protected-resource$1   [P,L]\n'
        '  RewriteRule ^oauth-authorization-server(/.*)?$ http://127.0.0.1:3012/.well-known/oauth-authorization-server$1 [P,L]\n'
        '</IfModule>\n'
    )
    with sftp.open(f'{wk_dir}/.htaccess', 'w') as fh:
        fh.write(htaccess_wk)
    print('  UP .well-known/.htaccess')

    # 4) MCP_INTERNAL_TOKEN sicherstellen (nach config.js-Upload!)
    print('\n--- MCP_INTERNAL_TOKEN ---')
    ensure_mcp_internal_token(sftp)

    sftp.close()

    # 5) npm install + PM2
    print('\n--- npm install ---')
    ssh_run(c, f'cd {REMOTE_NODE} && npm install --omit=dev 2>&1 | tail -3')

    print('\n--- PM2 restart ---')
    ssh_run(c, 'pm2 delete one-assist-mcp 2>/dev/null; true')
    ssh_run(c, f'cd {REMOTE_NODE} && pm2 start server-http.js --name one-assist-mcp')
    ssh_run(c, 'pm2 save')
    ssh_run(c, 'pm2 list')

    print('\n--- Health-Check ---')
    ssh_run(c, 'curl -s http://127.0.0.1:3012/health')

    c.close()
    print('\n=== Deploy fertig ===')
    print('MCP-API:     https://carecore.one/mcp/api')
    print('Discovery:   https://carecore.one/mcp/.well-known/oauth-authorization-server')
    print('Login-Form:  https://carecore.one/mcp/authorize (nur mit OAuth-Params zugänglich)')


if __name__ == '__main__':
    main()
