// MAX DAILY Loyalty — configuration. Leave Supabase blank to run in DEMO mode (localStorage).
window.MD_CONFIG = {
  SUPABASE_URL: "",       // e.g. https://xxxx.supabase.co
  SUPABASE_ANON_KEY: "",  // anon public key
  CASHIER_PIN: "2026",    // client-side gate only; change before going live
  TOTAL_STAMPS: 5,
  // Wallet button: paste your PassSlot / Zapped / Loopy smart link here (optional)
  WALLET_URL: "",
  CAFE: { name: "MAX DAILY", lat: 30.9771219, lng: 31.1763987, radiusMeters: 500 },
  GEO_MESSAGE: "ريحة القهوة وصلت! ☕ أنت على بعد خطوات من الكافيه، عدي علينا كمل أختامك واستمتع بقهوتك."
};
