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

  // MCP-Auth (eigenes System, unabhängig von auth.php)
  MCP_AUTH_ENDPOINT:  process.env.MCP_AUTH_ENDPOINT  || 'https://carecore.one/one_assist/api/mcp_auth.php',
  MCP_INTERNAL_TOKEN: process.env.MCP_INTERNAL_TOKEN || '',

  // Referenzdatenbank (himi10_search_map) — Mandanten-Tierung/WAZ/Privatpreis
  HIMI_MAN_ENDPOINT:  process.env.HIMI_MAN_ENDPOINT  || 'https://carecore.one/one_assist/manager/himi_man.php',

  // OAuth Public Base URL (für Discovery + Redirects)
  PUBLIC_BASE_URL:    process.env.PUBLIC_BASE_URL    || 'https://carecore.one/mcp',

  // Token-Lebensdauer (24h Default → "einmal am Tag anmelden")
  TOKEN_LIFETIME_SECONDS: parseInt(process.env.TOKEN_LIFETIME_SECONDS || String(24 * 60 * 60)),

  // Guest-Fallback (Legacy; wird nach OAuth-Login vom user-Objekt überstimmt)
  DEFAULT_TENANT_ID: parseInt(process.env.TENANT_ID || '10001'),
};
