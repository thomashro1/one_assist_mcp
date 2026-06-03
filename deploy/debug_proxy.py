import paramiko, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('dedi571.your-server.de', port=222, username='carecp', password='j6#Hv$!QH*b+', timeout=15)
sftp = c.open_sftp()

def run(cmd):
    _, out, err = c.exec_command(cmd)
    r = (out.read() + err.read()).decode('utf-8', errors='replace').strip()
    print(f'$ {cmd}\n{r}\n')
    return r

# Apache error log pruefen
run('tail -20 ~/logs/error_log 2>/dev/null || tail -20 /var/log/apache2/error.log 2>/dev/null || echo "no error log access"')

# Variante 1: nur [P,L] ohne ProxyPassReverse
htaccess_v1 = (
    'Options -Indexes\n'
    '<IfModule mod_rewrite.c>\n'
    '  RewriteEngine On\n'
    '  RewriteRule ^(.*)$ http://127.0.0.1:3012/$1 [P,L]\n'
    '</IfModule>\n'
)
with sftp.open('/usr/home/carecp/public_html/mcp/.htaccess', 'w') as fh:
    fh.write(htaccess_v1)
print('Updated .htaccess (without ProxyPassReverse)')

sftp.close()
import time; time.sleep(1)
run('curl -sk https://carecore.one/mcp/health')

c.close()
