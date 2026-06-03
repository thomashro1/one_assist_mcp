export const CONFIG = {
  // Rezept-Analyse
  BACKEND_ENDPOINT:   'https://carecore.one/ccone_api/m16_api/app/m16_2.php',
  BACKEND_CLIENT_KEY: '0FC88FBF77D500497141C7AF10DEB7E7',

  // FAISS semantische Suche
  FAISS_ENDPOINT:    'https://carecore.one/ccone_api/faiss_api/utils_api.php',
  FAISS_PROXY_TOKEN: 'DEMO-KICC-TOKEN-123456',

  // KI-Filter (OpenAI) — Key in Umgebungsvariable OPENAI_API_KEY setzen
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',

  // Produkt-Details
  PRODUCTS_ENDPOINT:   'https://carecore.one/ccone_api/produkt_api/produkt_api.php',
  PRODUCTS_CLIENT_KEY: 'TOKEN_ABC_123',
  PRODUCTS_KEY_HEADER: 'X-Proxy-Token',

  // Aufträge (carecore.one Webapp)
  ORDERS_ENDPOINT: 'https://carecore.one/one_assist/api/save_completed_order.php',

  DEFAULT_TENANT_ID: parseInt(process.env.TENANT_ID || '10001'),
};
