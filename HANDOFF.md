# Project Handoff: Kamu Bildirim Sepeti

- **Updated:** 2026-11-26 23:36 +03:00
- **Status:** READY (Faz 1-7 + Faz 9 Sprint 1 tamamlandi ve canli Workers + D1 uzerinde dogrulandi)
- **Live URL:** `https://kpssportal.ozunekmekci.workers.dev` (Version `12e91f1e-f10e-41a6-8a8d-6d2b8ac59a86`, Cron `*/5 * * * *`)
- **Database (D1):** `kamu_bildirim_sepeti` (`37ec183a-11be-4a6c-b0fd-caa2039677f7`, `EEUR`, `0001..0004`, `151` canli ilan + `179` alt kadro, `%77.48` il dolulugu, `0` ihale/DNS gurultusu)
- **Verified Baseline Commands (Faz 9 Sprint 1):**
  - `npm test`: 36/36 dosya, 383/383 test gecti (`10.65s`, `EXIT=0`)
  - `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run build:worker`: `EXIT=0`
  - Worker bundle: `handler.mjs` `6,757,239 B` (`6.44 MiB`, eski `25,229,987 B`), Wrangler Total Upload `10,801.50 KiB` / gzip `2,427.52 KiB` (eski `28,838.18 KiB` / `3,479.21 KiB`), startup `13 ms`
  - `node scripts/browser-audit.mjs`: `[AUDIT PASSED]` (14 rota HTTP 200, 20/20 matris 0 tasma, 5/5 R-35)
  - `CI=true npm run deploy`: `EXIT=0`, 8/8 canli ucta (`/`, `/analiz`, `/kaynak/kamuilan-sbb`, `/sehir/ankara`, `/kpss-arsivi`, `/sitemap.xml`, `/api/health`, `/api/sync/status`) HTTP 200

## Current Goal
**Kamu Bildirim Sepeti** SaaS urununun yuksek veri kalitesiyle canli takibini surdurmek ve siradaki **Faz 9 Sprint 2** veya **Faz 10** adimina hazirlanmak (**Faz 8** gelir/odeme katmani kullanici karariyla en son / demoda tutulur).

## Completed Since Last Handoff (Faz 9 Sprint 1)
- **Worker Paket Kucultme (`scripts/generate-archive-summary.ts`, `src/data/kpss_archive_summary.json`, `src/modules/analytics/public-insights.ts`, `package.json`, `tests/phase9-bundle-diet.test.ts`):** `9.703` KPSS yerlestirme kaydinin agregasyonu `build:archive-summary` ile `99,249 B` (`<100 KB`) kompakt `kpss_archive_summary.json` dosyasina ayrildi; `public-insights.ts` icinden `@/data/records` importu kaldirilarak `handler.mjs` %73.2 kucultuldu ve `PLACEMENT_RECORDS` ile birebir esitlik dogrulandi.
- **`/analiz` SBB Karti & Canli Kaynak Sagligi (`src/components/PublicInsightsClient.tsx`, `src/app/analiz/page.tsx`, `src/app/kaynak/[slug]/page.tsx`, `src/app/sitemap.ts`, `tests/phase3-ui.test.tsx`, `tests/phase9-ui.test.tsx`):** 4. resmi kaynak `kamuilan-sbb` karti, `/kaynak/kamuilan-sbb` rota + `sitemap.xml` kaydi ve `/api/sync/status` tabanli `Canli Kaynak Sagligi ve Ayristirici Durumu` paneli (`Saglikli`/`Uyari` rozetleri, yukleme/bos/hata durumlari) eklendi.

## Decisions & Constraints (Do Not Re-litigate)
- **Oncelik Sirasi:** Faz 7 + Faz 9 Sprint 1 tamam -> Faz 9 Sprint 2 (opsiyonel parser alarm webhook/bildirim) veya Faz 10 (Dusuk: `/nitelik/[kod]`, `/kurum/[slug]`, TWA/B2B) -> **Faz 8 EN SON** (odeme/e-posta demoda kalir).
- **R2 Cache (YAGNI):** OpenNext R2 incremental cache katmani mevcut ISR/SSG trafigi gerektirinceye kadar bilincli olarak ertelendi; ek bagimlilik/maliyet acilmadi.
- **WAF / Push-Ingest Mimarisi:** `kamuilan.sbb.gov.tr` ve `api.kariyerkapisi.gov.tr` datacenter IP engeli nedeniyle Worker `*/5` cron devre kesicili hizli sync yaparken `.github/workflows/sync-official-sources.yml` (`scripts/sync-remote.ts`) `POST /api/cron/ingest` ile tam zenginlestirilmis veriyi basar.
- **Marka & Hijyen:** YALNIZCA **Kamu Bildirim Sepeti**; 0 yasakli rakip adi, 0 em-dash (`\u2014`), `AGENTS.md` 1-9. satirlari koru.
- **Gizli Anahtarlar & Dizin:** Degerleri asla yazma/loglama; gercek repo `/home/znekm/Belgeler/kpssAtama`.

## Known Risks / Open Blockers
- None (GitHub Actions `CRON_SECRET` ve `SYNC_TARGET_URL` aktif; canli D1 ve Worker saglikli).

## Next Atomic Steps
1. **Faz 9 Sprint 2 (Opsiyonel) veya Faz 10:** Kaynak bazli ayrıştırıcı hata alarm/retry akisi veya `/nitelik/[kod]` + `/kurum/[slug]` programatik SEO sayfalari (**Faz 8** en son).

## Copy-Paste Resume Prompt
> Read `HANDOFF.md`, `AGENTS.md`, `docs/PROGRESS.md`, `docs/ROADMAP.md`, and `.agents/skills/github-handoff/SKILL.md`. Run `git status --short && git log -n 5 --oneline` and `npm test && npm run lint` to confirm baseline, honor the Phase 9 > 10 > 8 priority order, and execute Next Atomic Step #1.
