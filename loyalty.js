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

  const broadcast = (type, cust) => {
    if (!cust) return;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("maxdaily_loyalty");
        bc.postMessage({ type, customer: cust, phone: cust.phone, stamps: cust.stamps, visits: cust.visits });
      }
      localStorage.setItem("md_last_update", JSON.stringify({ t: Date.now(), phone: cust.phone, stamps: cust.stamps }));
    } catch (e) {}
  };

  // Realtime Sync to Google Sheet (deduplicated by phone, auto-sent to email)
  const syncSheet = (cust) => {
    if (!C.GOOGLE_SHEET_URL || !cust || !cust.phone) return;
    try {
      fetch(C.GOOGLE_SHEET_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          name: cust.name,
          phone: cust.phone,
          stamps: cust.stamps,
          visits: cust.visits,
          redeemed: cust.redeemed
        })
      }).catch(e => console.log("Google Sheet sync error:", e));
    } catch (e) {
      console.log("Sync trigger failed:", e);
    }
  };

  const api = {
    mode: useSB ? "supabase" : "demo",
    TOTAL,

    async register(name, phone) {
      phone = normPhone(phone);
      if (useSB) {
        const { data, error } = await sb.rpc("md_register", { p_name: name, p_phone: phone });
        if (error) throw error;
        syncSheet(data);
        broadcast("registered", data);
        return data;
      }
      const db = load();
      const existing = Object.values(db).find(c => c.phone === phone);
      if (existing) {
        syncSheet(existing);
        broadcast("registered", existing);
        return existing;
      }
      const c = { id: uuid(), name, phone, stamps: 0, visits: 0, redeemed: 0, first_order: true, created_at: Date.now() };
      db[c.id] = c; save(db);
      syncSheet(c);
      broadcast("registered", c);
      return c;
    },

    cacheCustomer(c) {
      if (!c || !c.id) return;
      const db = load();
      db[c.id] = c;
      if (c.phone) db[c.phone] = c;
      save(db);
    },

    async get(id) {
      if (useSB) {
        const { data, error } = await sb.rpc("md_get", { p_id: id });
        if (error) throw error;
        return data;
      }
      const db = load();
      return db[id] || Object.values(db).find(c => c.phone === id) || null;
    },

    async findByPhone(phone) {
      phone = normPhone(phone);
      if (useSB) {
        const { data, error } = await sb.rpc("md_find_phone", { p_phone: phone });
        if (error) throw error;
        return data;
      }
      const local = Object.values(load()).find(c => c.phone === phone);
      if (local) return local;

      // Fallback: Query Google Sheet
      if (C.GOOGLE_SHEET_URL) {
        try {
          const res = await fetch(C.GOOGLE_SHEET_URL + "?action=get&phone=" + encodeURIComponent(phone));
          const j = await res.json();
          if (j.status === "success" && j.customer) {
            const c = {
              id: j.customer.phone,
              name: j.customer.name,
              phone: j.customer.phone,
              stamps: Number(j.customer.stamps || 0),
              visits: Number(j.customer.visits || 0),
              redeemed: Number(j.customer.redeemed || 0),
              first_order: j.customer.first_order !== false,
              created_at: Date.now()
            };
            this.cacheCustomer(c);
            return c;
          }
        } catch(e) {}
      }
      return null;
    },

    // Wallet passes (Apple via PassSlot, Google via Wallet API)
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
        syncSheet(data);
        broadcast("stamp_update", data);
        return data;
      }
      const db = load();
      let c = db[id] || Object.values(db).find(x => x.phone === id);
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
      db[id] = c; save(db);
      syncSheet(c);
      broadcast("stamp_update", c);
      return c;
    }
  };
  window.MDStore = api;
})();
