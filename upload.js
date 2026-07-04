// POST /upload — multipart-Upload, tenant-scoped, kurze Ref-ID.
// Löst die MCP-Grenze bei großen Bildern: statt Base64 im Tool-Arg
// legt der User die Datei hier ab und übergibt Claude nur die Ref.

import { randomBytes } from 'crypto';
import { writeFile, mkdir, readFile, readdir, stat, unlink } from 'fs/promises';
import { join, extname } from 'path';
import { CONFIG } from './config.js';
import { verifyPassword } from './user_auth.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/one-assist-mcp-uploads';
const MAX_BYTES  = 25 * 1024 * 1024;  // 25 MB
const TTL_MS     = 24 * 60 * 60 * 1000;
const ALLOWED    = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'image/heic', 'image/heif', 'image/tiff',
  'application/pdf', 'application/octet-stream',
]);

await mkdir(UPLOAD_DIR, { recursive: true });

function randomId() { return 'up_' + randomBytes(9).toString('base64url'); }

/** POST /upload — nimmt multipart oder JSON (base64), gibt {ref, ...} zurück. */
export async function uploadHandler(req, res) {
  // Auth-Weg 1: Bearer-Token (MCP-Session)
  let tenant_id;
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (bearer && req.currentUser) tenant_id = req.currentUser.tenant_id;

  // Auth-Weg 2: E-Mail/Passwort im Body (für das Web-Formular)
  if (!tenant_id) {
    const email    = String(req.body?.email    || '');
    const password = String(req.body?.password || '');
    if (email && password) {
      const user = await verifyPassword(email, password);
      if (!user) return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
      tenant_id = user.tenant_id;
    }
  }

  if (!tenant_id) return res.status(401).json({ ok: false, error: 'AUTH_REQUIRED' });

  // Bild-Bytes einlesen (multipart ODER base64 im JSON-Body)
  let bytes, mime, filename;
  if (req.body?.image_base64) {
    const b64 = String(req.body.image_base64);
    mime      = String(req.body.mime_type || 'application/octet-stream');
    filename  = String(req.body.filename || 'upload');
    if (!ALLOWED.has(mime)) return res.status(400).json({ ok: false, error: 'UNSUPPORTED_MIME', mime });
    bytes = Buffer.from(b64, 'base64');
  } else if (req.file) {
    bytes    = req.file.buffer;
    mime     = req.file.mimetype;
    filename = req.file.originalname;
    if (!ALLOWED.has(mime)) return res.status(400).json({ ok: false, error: 'UNSUPPORTED_MIME', mime });
  } else {
    return res.status(400).json({ ok: false, error: 'NO_FILE' });
  }

  if (bytes.length > MAX_BYTES) {
    return res.status(413).json({ ok: false, error: 'TOO_LARGE', max_bytes: MAX_BYTES });
  }

  const ref = randomId();
  const ext = extname(filename) || '.' + (mime.split('/')[1] || 'bin');
  const meta = { ref, tenant_id, mime, filename, size: bytes.length, created_at: Date.now() };
  await writeFile(join(UPLOAD_DIR, ref + ext),         bytes);
  await writeFile(join(UPLOAD_DIR, ref + '.json'),     JSON.stringify(meta));

  res.json({ ok: true, ref, size: bytes.length, mime });
}

/** Löst eine Ref auf → {buffer, mime, filename}, prüft Tenant. */
export async function resolveRef(ref, tenant_id) {
  if (!/^up_[A-Za-z0-9_-]{6,32}$/.test(ref)) throw new Error('Ungültige Ref-Syntax.');
  const metaRaw = await readFile(join(UPLOAD_DIR, ref + '.json'), 'utf8').catch(() => null);
  if (!metaRaw) throw new Error(`Upload ${ref} nicht gefunden oder abgelaufen.`);
  const meta = JSON.parse(metaRaw);
  if (meta.tenant_id !== tenant_id) throw new Error(`Upload ${ref} gehört einem anderen Mandanten.`);
  if (Date.now() - meta.created_at > TTL_MS) throw new Error(`Upload ${ref} ist abgelaufen (>24h).`);

  const ext = extname(meta.filename) || '.' + (meta.mime.split('/')[1] || 'bin');
  const buf = await readFile(join(UPLOAD_DIR, ref + ext));
  return { buffer: buf, mime: meta.mime, filename: meta.filename };
}

/** Cleanup: entfernt Uploads > 24h alt. */
async function cleanup() {
  try {
    const files = await readdir(UPLOAD_DIR);
    const now = Date.now();
    for (const f of files) {
      const p = join(UPLOAD_DIR, f);
      const s = await stat(p).catch(() => null);
      if (s && now - s.mtimeMs > TTL_MS) await unlink(p).catch(() => {});
    }
  } catch { /* ignore */ }
}
setInterval(cleanup, 60 * 60 * 1000);
