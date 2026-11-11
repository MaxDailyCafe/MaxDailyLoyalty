# MAX DAILY Loyalty — Go-Live Checklist

Do in this order. Each step needs your own account/login, so these are the parts only you can do.

## 1. Supabase (free) — database
1. supabase.com → New project (region closest to Egypt, e.g. Frankfurt). Save the DB password.
2. SQL Editor → run `supabase_schema.sql`, then `supabase_wallet.sql` (fill `<PROJECT_REF>`, `<CRON_SECRET>`, `<ANON_KEY>` first).
3. Settings → API → copy **Project URL** and **anon public key** into `config.js`.
4. In `config.js` change `CASHIER_PIN` from `2026` to your own PIN.

## 2. Wallet function (needs Node — already installed)
```
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase functions deploy wallet --no-verify-jwt
npx supabase secrets set PASSSLOT_KEY=... PASSSLOT_TEMPLATE_ID=... GOOGLE_ISSUER_ID=... GOOGLE_SA_EMAIL=... GOOGLE_SA_PRIVATE_KEY="..." GOOGLE_LOGO_URL=https://... CRON_SECRET=...
```
Accounts/keys: see `README_WALLET.md` (PassSlot template + App Key, Google Wallet issuer + service account).
Google logo needs a public https URL: after step 3 you can use `https://<your-pages-url>/assets/logo_vertical.svg` — but Google wants PNG, so export a PNG from `Logos_Export/app_icon/png/` and put it in `assets/`.

## 3. Host the site (free, HTTPS required for camera + location + wallet)
Option A — GitHub Pages (same as the existing hub):
```
cd Loyalty_System
git init && git add . && git commit -m "MAX DAILY loyalty"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```
Repo → Settings → Pages → Deploy from branch `main` / root.
Don't commit anything with secrets; the anon key in `config.js` is meant to be public (the SQL locks the tables).
Option B — Netlify Drop (netlify.com/drop): drag the `Loyalty_System` folder, done.

URLs: customers `…/index.html`, cashier `…/cashier.html` (keep this one unlisted).

## 4. Connect to the bio-link page
Add a top button in `QR_Brand_Hub_Dashboard/index.html` linking to the customer URL (ask and I'll add it), and print the QR for it.

## 5. Test before opening to customers
- Register on an iPhone and an Android phone → card appears, "Add to Wallet" opens.
- Cashier: PIN → scan → +2 first order → card and wallet pass update.
- Walk within 500 m (or ask a friend) to check the lock-screen text.
- Google issuer must be approved (or your test phones added as testers) before public Android users can save the pass.
