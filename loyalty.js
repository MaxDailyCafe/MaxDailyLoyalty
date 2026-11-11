// Data layer: Supabase when configured, otherwise localStorage demo mode.
(function () {
  const C = window.MD_CONFIG;
  const TOTAL = C.TOTAL_STAMPS;
  const useSB = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase);
  const sb = useSB ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;
  const KEY = "md_loyalty_db";

  const load = () => JSON.parse(localStorage.getItem(KEY) || "{}");
  const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
  const normPhone = (p) => String(p).replace(/[^\d+]/g, "");

  const api = {
    mode: useSB ? "supabase" : "demo",
    TOTAL,

    async register(name, phone) {
      phone = normPhone(phone);
      if (useSB) {
        const { data, error } = await sb.rpc("md_register", { p_name: name, p_phone: phone });
        if (error) throw error;
        return data;
      }
      const db = load();
      const existing = Object.values(db).find(c => c.phone === phone);
      if (existing) return existing;
      const c = { id: uuid(), name, phone, stamps: 0, visits: 0, redeemed: 0, first_order: true, created_at: Date.now() };
      db[c.id] = c; save(db); return c;
    },

    async get(id) {
      if (useSB) {
        const { data, error } = await sb.rpc("md_get", { p_id: id });
        if (error) throw error;
        return data;
      }
      return load()[id] || null;
    },

    async findByPhone(phone) {
      phone = normPhone(phone);
      if (useSB) {
        const { data, error } = await sb.rpc("md_find_phone", { p_phone: phone });
        if (error) throw error;
        return data;
      }
      return Object.values(load()).find(c => c.phone === phone) || null;
    },

    // Wallet passes (Apple via PassSlot, Google via Wallet API) — handled by the Supabase Edge Function "wallet".
    async wallet(action, id) {
      if (!useSB) throw new Error("demo mode");
      const res = await fetch(C.SUPABASE_URL + "/functions/v1/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: C.SUPABASE_ANON_KEY, Authorization: "Bearer " + C.SUPABASE_ANON_KEY },
        body: JSON.stringify({ action, id })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || res.statusText);
      return j;
    },

    // action: ADD_1 | ADD_2_FIRST | REDEEM
    async apply(id, action) {
      if (useSB) {
        const { data, error } = await sb.rpc("md_apply", { p_id: id, p_action: action });
        if (error) throw error;
        return data;
      }
      const db = load(); const c = db[id];
      if (!c) throw new Error("Customer not found");
      if (action === "REDEEM") {
        if (c.stamps < TOTAL) throw new Error("Card is not full yet");
        c.stamps = 0; c.redeemed += 1;
      } else {
        if (c.stamps >= TOTAL) throw new Error("Card is full — redeem the free drink first");
        const add = action === "ADD_2_FIRST" ? (c.first_order ? 2 : 1) : 1;
        c.stamps = Math.min(TOTAL, c.stamps + add);
        c.visits += 1; c.first_order = false;
      }
      db[id] = c; save(db); return c;
    }
  };
  window.MDStore = api;
})();
