import { CONFIG } from '../config.js';

/**
 * Speichert einen Auftrag in himi10_orders.
 * tenant_id kommt IMMER aus dem eingeloggten User — nie aus Args.
 * items werden auf das Web-App-Schema gemappt (id, name, aidNumber, supplier, quantity, ean),
 * damit die Auftragshistorie in Web+App die Zeilen korrekt anzeigt.
 */
export async function auftragErfassen(user, args) {
  if (!user) throw new Error('Nicht angemeldet.');

  const items = (Array.isArray(args.items) ? args.items : []).map((it, idx) => ({
    id:        String(it.id        ?? it.interneID         ?? idx),
    name:      String(it.name      ?? it.Bezeichnung       ?? ''),
    aidNumber: String(it.aidNumber ?? it.Hilfsmittelnummer ?? ''),
    supplier:  String(it.supplier  ?? it.Hersteller        ?? ''),
    quantity:  Number(it.quantity  ?? it.menge             ?? 1),
    ean:       String(it.ean       ?? it.EAN               ?? ''),
  }));

  const body = {
    versicherter:      args.versicherter      ?? {},
    kostentraeger:     args.kostentraeger     ?? {},
    ausstellungsdatum: args.ausstellungsdatum ?? '',
    diagnose:          args.diagnose          ?? '',
    verordnungstext:   args.verordnungstext   ?? '',
    suchtext:          args.suchtext          ?? '',
    items,
    tenant_id:         user.tenant_id,
  };

  const res = await fetch(CONFIG.ORDERS_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Auftrag-Fehler HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  return await res.json();
}
