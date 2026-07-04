// Minimales Upload-Formular unter https://carecore.one/mcp/upload
// User meldet sich mit E-Mail + Passwort an, dropt Datei, kopiert Ref-ID.

export function uploadFormHtml() {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<title>ONE.assist — Rezept-Upload</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #3C4E95; margin: 0; padding: 0;
         min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; color: #1e293b; padding-top: 40px; }
  .card { background: #fff; border-radius: 10px; padding: 28px 30px; width: 440px;
          box-shadow: 0 12px 30px rgba(0,0,0,.25); }
  h1 { font-size: 22px; margin: 0 0 4px; color: #3C4E95; }
  h1 span { color: #3E8937; }
  .sub { font-size: 13px; color: #64748b; margin-bottom: 18px; }
  label { display: block; font-size: 12px; color: #64748b; margin-bottom: 4px; margin-top: 8px; }
  input[type="email"], input[type="password"] {
    width: 100%; padding: 9px 11px; border: 1px solid #cbd5e1; border-radius: 5px; font-size: 14px;
  }
  input[type="email"]:focus, input[type="password"]:focus, .drop.focus {
    outline: none; border-color: #3E8937; box-shadow: 0 0 0 2px rgba(62,137,55,.15);
  }
  .drop {
    border: 2px dashed #cbd5e1; border-radius: 6px; padding: 28px 16px; text-align: center;
    color: #64748b; margin-top: 12px; cursor: pointer; transition: all .15s;
  }
  .drop.dragover { border-color: #3E8937; background: rgba(62,137,55,.05); color: #3E8937; }
  button { width: 100%; margin-top: 12px; padding: 10px 18px; background: #3E8937; color: #fff;
           border: none; border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: 600; }
  button:hover { background: #326d2c; }
  button:disabled { background: #94a3b8; cursor: not-allowed; }
  .out { margin-top: 14px; padding: 12px; border-radius: 6px; font-size: 13px; word-break: break-all; }
  .ok  { background: #dcfce7; color: #166534; }
  .err { background: #fee2e2; color: #dc2626; }
  code { background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 3px; font-size: 13px; }
  .hint { font-size: 11px; color: #94a3b8; margin-top: 10px; }
  .filename { font-size: 12px; color: #334155; margin-top: 4px; word-break: break-all; }
</style></head>
<body>
<div class="card">
  <h1>ONE.<span>assist</span> — Rezept-Upload</h1>
  <div class="sub">Bild ablegen, Ref-ID kopieren, in Claude verwenden.</div>

  <label>E-Mail</label>
  <input type="email" id="email" required>
  <label>Passwort</label>
  <input type="password" id="password" required>

  <div class="drop" id="drop">
    Rezept-Bild hier ablegen<br><small>JPEG · PNG · HEIC · HEIF · WebP · TIFF · PDF (max 25 MB)</small>
    <div class="filename" id="filename"></div>
    <input type="file" id="file" style="display:none" accept="image/*,application/pdf">
  </div>

  <button id="go" disabled>Hochladen</button>
  <div id="out"></div>
  <div class="hint">Uploads werden nach 24 h automatisch gelöscht. Zugriff nur für den eingeloggten Mandanten.</div>
</div>

<script>
  const $ = id => document.getElementById(id);
  const drop = $('drop'), file = $('file'), go = $('go'), out = $('out'), fn = $('filename');
  let selected = null;

  function refreshBtn() { go.disabled = !(selected && $('email').value && $('password').value); }
  ['email','password'].forEach(id => $(id).addEventListener('input', refreshBtn));

  drop.addEventListener('click', () => file.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('dragover');
    if (e.dataTransfer.files[0]) { selected = e.dataTransfer.files[0]; fn.textContent = selected.name; refreshBtn(); }
  });
  file.addEventListener('change', () => {
    if (file.files[0]) { selected = file.files[0]; fn.textContent = selected.name; refreshBtn(); }
  });

  go.addEventListener('click', async () => {
    go.disabled = true; out.className = ''; out.textContent = 'Hochladen …';
    const fd = new FormData();
    fd.append('file', selected);
    fd.append('email',    $('email').value);
    fd.append('password', $('password').value);
    try {
      const r = await fetch('/mcp/upload', { method: 'POST', body: fd });
      const j = await r.json();
      if (!j.ok) {
        out.className = 'out err';
        out.textContent = 'Fehler: ' + (j.error || 'unknown');
      } else {
        out.className = 'out ok';
        out.innerHTML = 'Ref-ID: <code>' + j.ref + '</code><br>' +
                        '<button onclick="navigator.clipboard.writeText(\\'' + j.ref + '\\')" ' +
                        '  style="width:auto;padding:4px 10px;margin-top:8px;font-size:12px;">Kopieren</button>' +
                        '<br><small>In Claude sagen: „analysiere Rezept mit ref ' + j.ref + '"</small>';
      }
    } catch (e) {
      out.className = 'out err';
      out.textContent = 'Netzwerk-Fehler: ' + e.message;
    }
    go.disabled = false;
  });
</script>
</body></html>`;
}
