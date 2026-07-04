import { CONFIG } from '../config.js';
import { resolveRef } from '../upload.js';

/**
 * Schickt ein Rezeptbild an m16_2.php und gibt strukturierte
 * Verordnungsdaten zurück: versicherter, diagnose, produktsuche, etc.
 *
 * Drei Eingabe-Varianten (Priorität in dieser Reihenfolge):
 *   1) image_ref     — Upload-Referenz aus https://carecore.one/mcp/upload
 *   2) image_url     — Server lädt selbst
 *   3) image_base64  — nur für kleine Bilder (Kontext-Grenze!)
 */
export async function rezeptAnalysieren(user, { image_ref, image_url, image_base64, mime_type }) {
  let buffer;
  let effectiveMime;
  let filename = 'rezept';

  if (image_ref) {
    const r = await resolveRef(image_ref, user.tenant_id);
    buffer        = r.buffer;
    effectiveMime = r.mime;
    filename      = r.filename;
  } else if (image_url) {
    const r = await fetch(image_url);
    if (!r.ok) throw new Error(`Bild-Download HTTP ${r.status} von ${image_url}`);
    effectiveMime = r.headers.get('content-type') || mime_type || 'application/octet-stream';
    buffer = Buffer.from(await r.arrayBuffer());
  } else if (image_base64) {
    if (!mime_type) throw new Error('mime_type erforderlich, wenn image_base64 angegeben ist.');
    effectiveMime = mime_type;
    buffer = Buffer.from(image_base64, 'base64');
  } else {
    throw new Error('Entweder image_ref, image_url ODER image_base64 (+ mime_type) angeben.');
  }

  const ext = (effectiveMime.split('/')[1] || 'bin')
    .replace('jpeg', 'jpg')
    .replace(/^x-/, '');

  const form = new FormData();
  form.append('file',       new Blob([buffer], { type: effectiveMime }), filename.endsWith('.' + ext) ? filename : `rezept.${ext}`);
  form.append('client_key', CONFIG.BACKEND_CLIENT_KEY);

  const res = await fetch(CONFIG.BACKEND_ENDPOINT, {
    method:  'POST',
    headers: { 'X-Client-Key': CONFIG.BACKEND_CLIENT_KEY },
    body:    form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Analyse-Backend Fehler HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return await res.json();
}
