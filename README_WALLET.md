# Wallet setup (Apple + Google) — MAX DAILY

## What it does
- **iPhone** → "Add to Apple Wallet" (PassSlot pass). **Android** → "Add to Google Wallet". Desktop shows both.
- **Near the café (≤500 m):** the pass lock-screen text is personal and updates with every stamp, e.g. "باقي ختم واحد بس على مشروبك المجاني!" or "🎉 مشروبك المجاني مستنيك!".
- **Weekly (weekend):** every Friday a warm "you belong here" message is pushed to every saved pass (rotating 4 messages).
- Every stamp the cashier adds also updates the pass (Apple shows "الأختام: 3 / 5").

## One-time setup
1. **Supabase:** run `supabase_schema.sql`, then `supabase_wallet.sql` (fill `<PROJECT_REF>`, `<CRON_SECRET>`, `<ANON_KEY>`). Put URL + anon key in `config.js`.
2. **PassSlot (Apple):** in your template open Appearance → Source, paste `PassSlot_Loyalty_Card/passslot_api_placeholders.json`, upload logo + strip images (Designer tab). Copy the template ID and an App Key (App Keys page).
   - Free evaluation passes show a small PassSlot notice on the back. Removing it needs your own Apple Developer account (99 USD/yr) linked in PassSlot.
3. **Google Wallet (free):** create an Issuer at pay.google.com/business/console, enable "Google Wallet API" in Google Cloud, create a service account (JSON key), and add that service account email as a user in the Wallet console. Public logo URL needed (`GOOGLE_LOGO_URL`).
   - Issuer starts in demo mode: only test users you add in the console can save the pass until Google approves your issuer (free, takes a few days).
4. **Deploy the function:**
```
supabase functions deploy wallet --no-verify-jwt
supabase secrets set PASSSLOT_KEY=... PASSSLOT_TEMPLATE_ID=... GOOGLE_ISSUER_ID=... \
  GOOGLE_SA_EMAIL=... GOOGLE_SA_PRIVATE_KEY="$(cat key.pem-or-private_key-field)" \
  GOOGLE_LOGO_URL=https://... CRON_SECRET=choose-a-long-random-string
```
5. Set exact café coordinates in `supabase/functions/wallet/index.ts` (`CAFE`) and the template JSON.

## Honest limits
- Apple decides when the proximity text appears (it may need the phone within a few hundred metres; it shows once per visit). Google shows its own nearby notification using the program name; custom text is not supported there.
- Weekend message on Apple appears as a lock-screen notification because the field has `changeMessage`; Google gets it via `addMessage`.
