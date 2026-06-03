import { CONFIG } from '../config.js';

/**
 * Schickt ein Rezeptbild (Base64) an m16_2.php und gibt strukturierte
 * Verordnungsdaten zurück: versicherter, diagnose, produktsuche, etc.
 */
export async function rezeptAnalysieren({ image_base64, mime_type }) {
  const buffer = Buffer.from(image_base64, 'base64');
  const ext    = mime_type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';

  const form = new FormData();
  form.append('file',       new Blob([buffer], { type: mime_type }), `rezept.${ext}`);
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

  const data = await res.json();
  return data;
}
