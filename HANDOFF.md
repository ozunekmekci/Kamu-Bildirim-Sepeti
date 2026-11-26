# Project Handoff: Kamu Bildirim Sepeti

- **Updated:** 2026-11-26 19:58 +03:00
- **Status:** READY (Faz 1-7 tamamlandi ve canli Workers + D1 uzerinde dogrulandi)
- **Live URL:** `https://kpssportal.ozunekmekci.workers.dev` (Version `eae0b0ed-4bb7-419f-a457-a506b5a65dfc`, Cron `*/5 * * * *`)
- **Database (D1):** `kamu_bildirim_sepeti` (`37ec183a-11be-4a6c-b0fd-caa2039677f7`, `EEUR`, `0001..0004`, `151` canli ilan + `179` alt kadro, `%77.48` il dolulugu, `0` ihale/DNS gurultusu)
- **Verified Baseline Commands (Faz 7):**
  - `npm test`: 34/34 dosya, 373/373 test gecti (`9.28s`, `EXIT=0`)
  - `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run deploy`: `EXIT=0`
  - `node scripts/browser-audit.mjs`: `[AUDIT PASSED]` (14 rota HTTP 200, 20/20 matris 0 tasma, 5/5 R-35)
  - `npx tsx scripts/sync-remote.ts --target https://kpssportal.ozunekmekci.workers.dev`: `145` tekil ilan, `179` pozisyon (`EXIT=0`) + Worker `POST /api/cron/sync`: `8.2s` HTTP 200

## Current Goal
**Kamu Bildirim Sepeti** SaaS urununun yuksek veri kalitesiyle canli takibini surdurmek ve siradaki orta oncelikli **Faz 9** (Worker paket kucultme, R2 cache, `/analiz` SBB karti + kaynak saglik alarmi) adimina hazirlanmak (**Faz 8** gelir/odeme katmani kullanici karariyla en son / demoda tutulur).

## Completed Since Last Handoff (Faz 7)
- **Kaynaklar & Taksonomi (`src/modules/announcements/{types,taxonomy,connectors,parsers}.ts`):** Kariyer Kapisi JSON API (`GetIseAlimPage`, `GetIlanPreviewPublic`, `GetAltIlanInfoByIlanIdPublic`), SBB (`kamuilan.sbb.gov.tr`), ISKUR Kamu Memur (`iskur.gov.tr/ilanlar/kamu-memur-alim-ilanlari/`), RG pozitif filtresi, 81 il/ilce/universite il cikarimi, ic taksonomi ve capraz tekillestirme.
- **D1 `0004` & 5 Dk Senkronizasyon (`migrations/0004_phase7_enrichment.sql`, `src/modules/db/`, `service.ts`, `matching/engine.ts`, `api/**`):** `announcement_positions` (179 satir), `source_checkpoints`, `saved_searches`, 10-tablo KVKK silme, monotonik `enriched` koruma, devre kesicili `8.2s` Worker cron, `POST /api/cron/ingest`, `scripts/sync-remote.ts`, `.github/workflows/sync-official-sources.yml`, pozisyon bazli Matching v2.
- **Premium UI/UX (`src/app/globals.css`, `AnnouncementFeed.tsx`, `AnnouncementDetailClient.tsx`, `/ilan/[id]`, `/ayarlar`, `/kaynak/[slug]`):** Canli guncellik bandi, kategori sekmeleri, `Mulakatsiz (KPSS)` filtresi, alt kadrolu slide-over cekmece, arama alarmi.

## Decisions & Constraints (Do Not Re-litigate)
- **Oncelik Sirasi:** Faz 7 tamam (#1) -> Faz 9 (Orta: performans/DevOps) -> Faz 10 (Dusuk: SEO/TWA/B2B) -> **Faz 8 EN SON** (kullanici odeme/e-postayi demoda tutmak istiyor).
- **WAF / Push-Ingest Mimarisi:** `kamuilan.sbb.gov.tr` ve `api.kariyerkapisi.gov.tr` Cloudflare Workers datacenter IP'lerini engellediginden (`403`/timeout), Worker `*/5` cron devre kesicili hizli sync yaparken `scripts/sync-remote.ts` (ve aktif `.github/workflows/sync-official-sources.yml`) `POST /api/cron/ingest` ile tam zenginlestirilmis veriyi basar; monotonik D1 upsert enriched veriyi korur.
- **Marka & Hijyen:** YALNIZCA **Kamu Bildirim Sepeti**; 0 yasakli rakip adi, 0 em-dash (`\u2014`), `AGENTS.md` 1-9. satirlari koru.
- **Gizli Anahtarlar & Dizin:** Degerleri asla yazma/loglama; gercek repo `/home/znekm/Belgeler/kpssAtama`.

## Known Risks / Open Blockers
- None (GitHub Actions `CRON_SECRET` ve `SYNC_TARGET_URL` aktif ve Worker ile esitlendi).

## Next Atomic Steps
1. **Faz 9 Sprint 1:** `9.703` KPSS arsiv verisini kompakt JSON/D1'e ayirarak Worker paketini (`28.8 MB`) kucult, `src/components/PublicInsightsClient.tsx` (/analiz) icine SBB kartini ekle.

## Copy-Paste Resume Prompt
> Read `HANDOFF.md`, `AGENTS.md`, `docs/PROGRESS.md`, `docs/ROADMAP.md`, and `.agents/skills/github-handoff/SKILL.md`. Run `git status --short && git log -n 5 --oneline` and `npm test && npm run lint` to confirm baseline, honor the Phase 9 > 10 > 8 priority order, and execute Next Atomic Step #1.
