// Supabase Edge Function: wallet
// Actions: create (Apple via PassSlot + Google Wallet links), sync (push new stamps), weekend (cron: warm weekly message)
// Secrets: PASSSLOT_KEY, PASSSLOT_TEMPLATE_ID, GOOGLE_ISSUER_ID, GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY,
//          GOOGLE_LOGO_URL, CRON_SECRET  (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided automatically)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const env = (k: string) => Deno.env.get(k) ?? "";
const CAFE = { lat: 30.9771219, lng: 31.1763987 }; // replace with exact café coordinates
const TOTAL = 5;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// ---------- copy ----------
const nearText = (stamps: number, first: boolean) =>
  stamps >= TOTAL ? "🎉 مشروبك المجاني مستنيك! عدّي استلمه دلوقتي ☕"
  : stamps === TOTAL - 1 ? "باقي ختم واحد بس على مشروبك المجاني! ☕ عدّي علينا"
  : first && stamps === 0 ? "كارت الولاء جاهز 🎁 أول طلب = ختمان"
  : `أنت قريب مننا! باقي ${TOTAL - stamps} أختام على مشروبك المجاني ☕`;
const statusText = (stamps: number) => stamps >= TOTAL ? "🎉 مشروبك المجاني جاهز" : `${stamps} / ${TOTAL} — باقي ${TOTAL - stamps}`;
const WEEKEND = [
  "ويك إند جميل يبدأ بفنجان دافي ☕ المكان مستنيك زي كل مرة — MAX DAILY بيتك التاني.",
  "الويك إند ليه طعم تاني مع قهوتك المفضلة ☕ تعالى خد نفسك معانا، كلنا هنا عيلة.",
  "وحشتنا قعدتك! ☕ كوباية دافية وكرواسون طازة مستنيينك الويك إند ده.",
  "في MAX DAILY دايماً في مكان ليك وفنجان على حسابنا من الدفا ☕ نورتنا الويك إند.",
];

// ---------- PassSlot (Apple Wallet) ----------
const PS = "https://api.passslot.com/v1";
const psHeaders = () => ({ Authorization: "Basic " + btoa(env("PASSSLOT_KEY") + ":"), "Content-Type": "application/json" });
const appleValues = (c: any, extra: Record<string, string> = {}) => ({
  stamps: `${c.stamps} / ${TOTAL}`, status: statusText(c.stamps), memberName: c.name, memberId: c.id,
  nearText: nearText(c.stamps, c.first_order), ...extra,
});
async function appleCreate(c: any) {
  const r = await fetch(`${PS}/templates/${env("PASSSLOT_TEMPLATE_ID")}/pass`, {
    method: "POST", headers: psHeaders(), body: JSON.stringify(appleValues(c, { weekendMsg: "أهلاً بيك في عيلة MAX DAILY ☕" })),
  });
  if (!r.ok) throw new Error("PassSlot: " + (await r.text()));
  return await r.json(); // { serialNumber, passTypeIdentifier, url }
}
async function appleUpdate(c: any, extra: Record<string, string> = {}) {
  if (!c.apple_serial) return;
  await fetch(`${PS}/passes/${c.apple_type}/${c.apple_serial}/values`, {
    method: "PUT", headers: psHeaders(), body: JSON.stringify(appleValues(c, extra)),
  });
}

// ---------- Google Wallet ----------
const b64u = (b: ArrayBuffer | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b);
  let s = ""; bytes.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
async function signJwt(payload: Record<string, unknown>) {
  const pem = env("GOOGLE_SA_PRIVATE_KEY").replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const data = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64u(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(data));
  return data + "." + b64u(sig);
}
async function gToken() {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt({ iss: env("GOOGLE_SA_EMAIL"), scope: "https://www.googleapis.com/auth/wallet_object.issuer",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  return (await r.json()).access_token as string;
}
const WO = "https://walletobjects.googleapis.com/walletobjects/v1";
const classId = () => `${env("GOOGLE_ISSUER_ID")}.maxdaily_loyalty`;
const objId = (c: any) => `${env("GOOGLE_ISSUER_ID")}.${c.id.replace(/-/g, "")}`;
async function gCall(tok: string, method: string, path: string, body?: unknown) {
  return await fetch(WO + path, { method, headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
}
async function ensureClass(tok: string) {
  const body = {
    id: classId(), issuerName: "MAX DAILY", programName: "MAX DAILY Loyalty Club — مشروبك السادس مجاناً",
    programLogo: { sourceUri: { uri: env("GOOGLE_LOGO_URL") } }, hexBackgroundColor: "#1A120D",
    reviewStatus: "UNDER_REVIEW", locations: [{ latitude: CAFE.lat, longitude: CAFE.lng }],
  };
  const r = await gCall(tok, "POST", "/loyaltyClass", body);
  if (!r.ok && r.status !== 409) throw new Error("Google class: " + (await r.text()));
}
const gObject = (c: any) => ({
  id: objId(c), classId: classId(), state: "ACTIVE", accountName: c.name, accountId: c.id,
  barcode: { type: "QR_CODE", value: c.id, alternateText: c.phone },
  loyaltyPoints: { label: "الأختام / STAMPS", balance: { string: `${c.stamps} / ${TOTAL}` } },
  textModulesData: [{ header: "STATUS", body: statusText(c.stamps), id: "status" }],
  locations: [{ latitude: CAFE.lat, longitude: CAFE.lng }],
});
async function googleCreate(c: any) {
  const tok = await gToken(); await ensureClass(tok);
  const r = await gCall(tok, "POST", "/loyaltyObject", gObject(c));
  if (!r.ok && r.status !== 409) throw new Error("Google object: " + (await r.text()));
  const jwt = await signJwt({ iss: env("GOOGLE_SA_EMAIL"), aud: "google", typ: "savetowallet", iat: Math.floor(Date.now() / 1000),
    payload: { loyaltyObjects: [{ id: objId(c) }] } });
  return { id: objId(c), url: "https://pay.google.com/gp/v/save/" + jwt };
}
async function googleUpdate(c: any, message?: { header: string; body: string }) {
  if (!c.google_object_id) return;
  const tok = await gToken();
  await gCall(tok, "PATCH", `/loyaltyObject/${c.google_object_id}`, gObject(c));
  if (message) await gCall(tok, "POST", `/loyaltyObject/${c.google_object_id}/addMessage`, { message: { ...message, messageType: "TEXT" } });
}

// ---------- handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { action, id } = await req.json();

    if (action === "weekend") {
      if (req.headers.get("x-cron-secret") !== env("CRON_SECRET")) return json({ error: "forbidden" }, 403);
      const week = Math.floor(Date.now() / (7 * 864e5));
      const text = WEEKEND[week % WEEKEND.length];
      const cutoff = new Date(Date.now() - 5 * 864e5).toISOString();
      const { data } = await sb.from("customers").select("*").or("apple_serial.not.is.null,google_object_id.not.is.null")
        .or(`last_weekend_push.is.null,last_weekend_push.lt.${cutoff}`);
      let n = 0;
      for (const c of data ?? []) {
        await appleUpdate(c, { weekendMsg: text }).catch(() => {});
        await googleUpdate(c, { header: "MAX DAILY ☕", body: text }).catch(() => {});
        await sb.from("customers").update({ last_weekend_push: new Date().toISOString() }).eq("id", c.id); n++;
      }
      return json({ pushed: n });
    }

    if (!id) return json({ error: "missing id" }, 400);
    const { data: c } = await sb.from("customers").select("*").eq("id", id).single();
    if (!c) return json({ error: "customer not found" }, 404);

    if (action === "create") {
      const upd: Record<string, unknown> = {};
      if (!c.apple_url && env("PASSSLOT_KEY")) {
        const a = await appleCreate(c); Object.assign(upd, { apple_serial: a.serialNumber, apple_type: a.passTypeIdentifier, apple_url: a.url });
      }
      if (!c.google_object_id && env("GOOGLE_SA_EMAIL")) {
        const g = await googleCreate(c); upd.google_object_id = g.id; upd.google_url = g.url;
      } else if (c.google_object_id) { upd.google_url = (await googleCreate(c)).url; } // fresh JWT
      if (Object.keys(upd).length) await sb.from("customers").update(upd).eq("id", id);
      const m = { ...c, ...upd };
      return json({ apple_url: m.apple_url ?? null, google_url: m.google_url ?? null });
    }

    if (action === "sync") {
      await Promise.allSettled([appleUpdate(c), googleUpdate(c)]);
      return json({ ok: true });
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});
