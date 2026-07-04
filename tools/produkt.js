import { CONFIG } from '../config.js';

/**
 * Lädt Detaildaten + Bilder zu einem Produkt via produkt_api.php.
 * Entspricht dem Aufruf in ProduktCardPage (groups[]=expo_product&id[]=<id>).
 */
export async function produktDetails(user, { id }) {
  const url = new URL(CONFIG.PRODUCTS_ENDPOINT);
  url.searchParams.append('groups[]', 'expo_product');
  url.searchParams.append('id[]', String(id));

  const res = await fetch(url.toString(), {
    method:  'GET',
    headers: { [CONFIG.PRODUCTS_KEY_HEADER]: CONFIG.PRODUCTS_CLIENT_KEY },
  });

  if (!res.ok) {
    throw new Error(`Produkt-API Fehler HTTP ${res.status}`);
  }

  const raw = await res.json();

  // Hydra-Wrapper oder direktes Array auflösen
  const item = raw?.['hydra:member']?.[0] ?? (Array.isArray(raw) ? raw[0] : raw);
  if (!item) throw new Error(`Produkt ${id} nicht gefunden.`);

  return {
    id:                          item.id,
    name:                        item.name,
    aidNumber:                   item.aidNumber,
    hersteller:                  item.supplier?.name ?? item.manufacturer?.name ?? '',
    eanGtin:                     item.eanGtin ?? '',
    artikelnummer:               item.productNumberOfManufacturer ?? '',
    erpNumber:                   item.erpNumber ?? '',
    beschreibung:                item.description ?? item.shortDescription ?? '',
    langbeschreibung:            item.longDescription ?? '',
    eigenschaften:               item.productProperties ?? [],
    verkaufsargumente:           item.salesArguments ?? [],
    preisListeSupplier:          item.listpriceSupplier ?? null,
    steuer:                      item.taxRate?.rate ?? null,
    zahlungskennzeichen:         item.paymentMark?.name ?? '',
    bilder: {
      haupt:         extractImageUrl(item.mainImagePath ?? item.image),
      konfiguration: extractImageList(item.base64Strings?.configurationImages ?? item.configurationImages),
      detail:        extractImageList(item.base64Strings?.detailImages ?? item.detailImages),
    },
    varianten: (item.productVariants ?? []).map(v => ({
      id:            v.id,
      verfuegbar:    v.available ?? true,
      ean:           v.eanGtin ?? '',
      artikelnummer: v.productNumberOfManufacturer ?? '',
      optionen:      v.variantOptions ?? [],
    })),
    variantenSchema: item.variantSchema ?? null,
  };
}

function extractImageUrl(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  return val.url ?? val.path ?? null;
}

function extractImageList(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(extractImageUrl).filter(Boolean);
  return [];
}
