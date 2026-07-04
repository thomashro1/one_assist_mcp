import { CONFIG } from '../config.js';

/**
 * Klassische Produktsuche: direkte Filter-Query gegen produkt_api.php.
 * Entspricht dem Flow aus KlassischeSuchePage (Web-App).
 * Nach der Suche: Anreicherung mit mandantenspezifischer Referenz aus himi10_search_map
 * (basic/comfort/premium, WAZ, Privatpreis, Hinweise).
 */
export async function produkteSuchenKlassisch(user, args) {
  if (!user) throw new Error('Nicht angemeldet.');

  const {
    name              = '',
    beschreibung      = '',
    hersteller        = '',
    hilfsmittelnummer = '',
    lieferanten_artnr = '',
    ean               = '',
    max_seiten        = 50,
  } = args || {};

  const baseParams = new URLSearchParams();
  baseParams.append('groups[]', 'semanticindex');
  if (name)              baseParams.set('name',                       name);
  if (beschreibung)      baseParams.set('searchValue',                beschreibung);
  if (hersteller)        baseParams.set('supplier.name',              hersteller);
  if (hilfsmittelnummer) baseParams.set('aidNumber',                  hilfsmittelnummer);
  if (lieferanten_artnr) baseParams.set('productNumberOfManufacturer', lieferanten_artnr);
  if (ean)               baseParams.set('eanGtin',                    ean);

  // Mindestens ein Filter erforderlich
  const filterKeys = ['name', 'searchValue', 'supplier.name', 'aidNumber', 'productNumberOfManufacturer', 'eanGtin'];
  const hasFilter = filterKeys.some(k => baseParams.get(k));
  if (!hasFilter) {
    throw new Error('Mindestens ein Suchfilter muss angegeben werden.');
  }

  // Auto-Paginierung (analog zu KlassischeSuchePage.fetchAllProducts)
  const all = [];
  const headers = { [CONFIG.PRODUCTS_KEY_HEADER]: CONFIG.PRODUCTS_CLIENT_KEY };
  for (let p = 1; p <= max_seiten; p++) {
    const params = new URLSearchParams(baseParams);
    params.set('page', String(p));
    const res = await fetch(`${CONFIG.PRODUCTS_ENDPOINT}?${params}`, { method: 'GET', headers });
    if (!res.ok) throw new Error(`Produkt-API Fehler HTTP ${res.status}`);
    const json  = await res.json();
    const items = Array.isArray(json)
      ? json
      : (Array.isArray(json['hydra:member']) ? json['hydra:member'] : []);
    if (!items.length) break;
    all.push(...items);
    if (!json?.['hydra:view']?.['hydra:next']) break;
  }

  if (all.length === 0) {
    return {
      tenant_id: user.tenant_id,
      filter:    { name, beschreibung, hersteller, hilfsmittelnummer, lieferanten_artnr, ean },
      produkte:  [],
      count:     0,
    };
  }

  // Auf gemeinsames Feld-Schema mappen (kompatibel zu produkte_suchen)
  const produkte = all.map(item => ({
    interneID:         item.id,
    Bezeichnung:       item.name ?? '',
    Hersteller:        item.supplier?.name ?? item.manufacturer?.name ?? '',
    Hilfsmittelnummer: item.aidNumber ?? '',
    Artikelnummer:     item.productNumberOfManufacturer ?? '',
    EAN:               item.eanGtin ?? '',
  }));

  // Referenzdatenbank-Anreicherung (mandantenabhängig)
  const refMap = await ladeReferenzMap(user.tenant_id, produkte);
  const angereichert = produkte.map(p => {
    const himi = normalisiereHimi(p.Hilfsmittelnummer);
    const ref  = himi ? refMap.get(himi) : null;
    return {
      ...p,
      referenz: ref ? {
        basic:     Boolean(Number(ref.himi10_basic)),
        comfort:   Boolean(Number(ref.himi10_comfort)),
        premium:   Boolean(Number(ref.himi10_premium)),
        waz:       ref.himi10_0waz ?? null,
        p_preis:   ref.p_preis     ?? null,
        hinweis_1: ref.hinweis_1   ?? null,
        hinweis_2: ref.hinweis_2   ?? null,
      } : null,
    };
  });

  return {
    tenant_id:        user.tenant_id,
    filter:           { name, beschreibung, hersteller, hilfsmittelnummer, lieferanten_artnr, ean },
    produkte:         angereichert,
    count:            angereichert.length,
    referenz_treffer: refMap.size,
    seiten_geladen:   Math.min(max_seiten, Math.ceil(all.length / Math.max(1, all.length))),
  };
}

// --- geteilte Helfer (Duplikat aus suche.js — später ggf. extrahieren) ------

function normalisiereHimi(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  return s === '' ? null : s;
}

async function ladeReferenzMap(tenant_id, produkte) {
  const himis = [...new Set(
    produkte.map(p => normalisiereHimi(p.Hilfsmittelnummer)).filter(Boolean)
  )];
  if (himis.length === 0) return new Map();

  try {
    const res = await fetch(CONFIG.HIMI_MAN_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action:    'search',
        tenant_id,
        data:      { q: '', limit: 5000 },
      }),
    });
    if (!res.ok) return new Map();
    const json = await res.json();
    const rows = Array.isArray(json?.data) ? json.data : [];

    const wanted = new Set(himis);
    const map    = new Map();
    for (const row of rows) {
      const key = normalisiereHimi(row.himi10_search);
      if (key && wanted.has(key)) map.set(key, row);
    }
    return map;
  } catch {
    return new Map();
  }
}
