# Project Handoff: Kamu Bildirim Sepeti

- **Updated:** 2026-11-26 18:30 +03:00
- **Status:** READY (Faz 1-6 tamamlandi; Cloudflare Workers + D1 + Cron canli yayinda)
- **Live URL:** `https://kpssportal.ozunekmekci.workers.dev` (Version `c6fd9845-5e34-4987-9163-16fed3f80baf`, Cron `0 */6 * * *`)
- **Database (D1):** `kamu_bildirim_sepeti` (`37ec183a-11be-4a6c-b0fd-caa2039677f7`, region `EEUR`, `0001..0003` applied, `77` announcements)
- **Verified Baseline Commands (Faz 6):**
  - `npm test` (paralel): 31/31 dosya, 347/347 test gecti (`9.09s`, `EXIT=0`)
  - `npm run lint` & `npx tsc --noEmit`: 0 hata (`EXIT=0`)
  - `npm run build` & `npm run deploy`: `EXIT=0` (`28451.09 KiB`, `15 ms` startup)
  - `node scripts/browser-audit.mjs`: `[AUDIT PASSED]` (14 rota HTTP 200, 20/20 Masaustu/Mobil Acik/Koyu 0 tasma, 5/5 R-35)
  - Canli duman testi: `/api/health`, `/api/announcements` (`77`), `/`, `/analiz`, `/kpss-arsivi`, `/sehir/{ankara,istanbul,izmir}`, `/kaynak/kariyer-kapisi`, `/ayarlar`, `/profil` hepsi HTTP 200

## Current Goal
Canli Cloudflare Workers uzerinde calisan **Kamu Bildirim Sepeti** SaaS urununde istege bagli ucretli e-posta/odeme saglayicilarini (`Resend`/`Stripe`/`iyzico`) ve ozel alan adini bağlamak, ardindan uretim kalitesini izlemek.

## Completed Since Last Handoff (Faz 6)
- **Kariyer Kapisi Canli RSS (`src/modules/announcements/parsers.ts`, `scripts/probe-sources.ts`, `tests/phase6-kariyer-rss.test.ts`):** `https://kariyerkapisi.gov.tr/RSS` (`feedUrl`) ve Turkce buyuk harf uyumlu `splitInstitutionAndTitle` + `?i=<uuid>` kalici ID eklendi (`npm run probe:sources`: toplam `53` canli ilan = Kariyer Kapisi `25` + ISKUR `12` + Resmi Gazete `16`).
- **Cloudflare D1 & Workers Canli Yayin (`wrangler.jsonc`):** `kamu_bildirim_sepeti` D1 veritabani olusturuldu, `0001..0003` uzak migrasyonlar uygulandi, 8 gizli anahtar (`wrangler secret bulk`) yuklendi ve ilk canli `POST /api/cron/sync` `53` ilani D1'e yazdi (`errors: []`).
- **Worker 10ms CPU (Error 1102) Cozumu (`src/modules/analytics/public-insights.ts`, `src/components/KpssArchiveLoader.tsx`, `src/app/kpss-arsivi/page.tsx`):** Sehir normalizasyonu/slug memoize edildi + `WeakMap` indeksi eklendi; `/kpss-arsivi` 9.703 kayitlik arama motoru istemci dinamik yukleyicisine alindi (`HTTP 503/1102` -> `HTTP 200`).

## Decisions & Constraints (Do Not Re-litigate)
- **Marka Adi:** YALNIZCA **Kamu Bildirim Sepeti**. Ucuncu taraf rakip uygulama adini asla kullanma.
- **Metin Hijyeni:** Kod, UI, hata mesajlari ve dokumanlarda em-dash (`\u2014`) kullanma (0 eslesme).
- **Resmi Kaynak & Hukuk:** Kariyer Kapisi, ISKUR, Resmi Gazete + `/kpss-arsivi`; resmi kurum metni baglayicidir; KVKK 5 kategori ve `'SIL'` ile hesap silme korunur.
- **Gizli Anahtarlar:** Hicbir gizli anahtar degerini (`SESSION_SECRET`, `CRON_SECRET`, `VAPID_PRIVATE_KEY`) dosyalara/loglara yazma; Cloudflare Secrets Store uzerinde yonet.
- **Yerel Dizin Notu:** Diskteki gercek repo `/home/znekm/Belgeler/kpssAtama`; `AGENTS.md` 1-9. satirlari koru.

## Known Risks / Open Blockers
- E-posta (`RESEND_API_KEY`/`MAILCHANNELS_API_KEY`) ve gercek odeme (`STRIPE_*`/`IYZICO_*`) saglayicilari henuz opsiyonel modda (`email: noop`, `payment: demo`).
- Canli D1 icindeki 24 tohum + 53 canli ilan arasinda tarih formatindan dolayi bazi Kariyer Kapisi RSS kayitlari (son tarih metni yoksa `pubDate` esasli) `kapali` sekmesinde gorunur.

## Next Atomic Steps
1. Opsiyonel canli entegrasyon anahtarlarini ekle (`RESEND_API_KEY` + `EMAIL_FROM`, ve/veya `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` ya da `IYZICO_*`) ve ozel alan adi (`NEXT_PUBLIC_SITE_URL`) tanimla.
2. Kariyer Kapisi RSS ilanlarinda acik/kapali tarih ayrımını detay sayfasi veya aktif RSS kurallarina gore zenginlestirme ihtiyacini degerlendir.

## Copy-Paste Resume Prompt
> Read `HANDOFF.md`, `AGENTS.md`, `docs/PROGRESS.md`, and `.agents/skills/github-handoff/SKILL.md`. Run `git status --short && git log -n 5 --oneline` and `npm test && npm run lint` to confirm baseline, adopt all Decisions & Constraints without re-litigating, and continue immediately from Next Atomic Step #1.
