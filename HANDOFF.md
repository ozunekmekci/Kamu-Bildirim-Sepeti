# Project Handoff: Kamu Bildirim Sepeti

- **Updated:** 2026-11-27 00:13 +03:00
- **Status:** READY (Faz 1-7 + Faz 9 Sprint 1 + SBB/RSS 3 kok-neden duzeltmesi canli Workers + D1 uzerinde dogrulandi)
- **Live URL:** `https://kpssportal.ozunekmekci.workers.dev` (Version `9a79e48a-32eb-4c74-95c0-858b3af936c2`, Cron `*/5 * * * *`)
- **Database (D1):** `kamu_bildirim_sepeti` (`37ec183a-11be-4a6c-b0fd-caa2039677f7`, `EEUR`, `0001..0004`, `158` canli ilan: `sbb` 96/96 `acik`, `iskur` 36/36 `acik`, `kariyer_kapisi` 26/26 `acik` + `180` alt kadro)
- **Verified Baseline Commands:**
  - `npx vitest run --no-file-parallelism`: 37/37 dosya, 387/387 test gecti (`35.80s`, `EXIT=0`)
  - `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run build:worker`: `EXIT=0`
  - Worker bundle: `10,808.59 KiB` / gzip `2,430.42 KiB`, startup `14 ms`
  - `node scripts/browser-audit.mjs`: `[AUDIT PASSED]` (14 rota HTTP 200, 20/20 matris 0 tasma, 5/5 R-35)
  - `sync:remote` (`152` tekil, `180` alt kadro) + `POST /api/cron/sync` (HTTP 200, sifir status dususu/ciftlenme) + canli SBB `/ilan/<id>` (`href="https://kamuilan.sbb.gov.tr/"`) dogrulandi

## Current Goal
**Kamu Bildirim Sepeti** SaaS urununun yuksek veri kalitesiyle canli takibini surdurmek ve siradaki **Faz 9 Sprint 2** veya **Faz 10** adimina hazirlanmak (**Faz 8** gelir/odeme katmani kullanici karariyla en son / demoda tutulur).

## Completed Since Last Handoff (Faz 9 Sprint 1 & SBB/RSS Bugfix)
- **SBB Referer 404, Stabil ID ve RSS Status Duzeltmeleri (`src/modules/announcements/official-link.ts`, `connectors.ts`, `src/modules/db/{d1,memory}-adapter.ts`, 5 UI cagiricisi, `tests/bugfix-sbb-links-and-status.test.tsx`):** SBB `ilanDetay.aspx?kod=...` harici tiklamalarda soft-404 dondugu icin `resolveOfficialLink` ile varsa capraz kaynak direkt linki yoksa `https://kamuilan.sbb.gov.tr/` + 1-tik kurum adi kopyalama eklendi; SBB ID'si donen sifreli `kod=` yerine deterministik icerik anahtarina alindi; D1/Memory upsert icinde `enriched` gelecek tarihli ilanlarin RSS fallback sirasinda `status='kapali'` ezilmesi kapatildi.
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
