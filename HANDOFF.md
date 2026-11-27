# Project Handoff: Kamu Bildirim Sepeti

- **Updated:** 2026-11-27 04:55 +03:00
- **Status:** READY (Saha Cilasi: canli SSR ilk boyama, debounced tam D1 arama/filtre, /analiz canli sayim, 44px mobil hedefler ve SBB ozet temizligi canli Workers + D1 uzerinde dogrulandi)
- **Live URL:** `https://kpssportal.ozunekmekci.workers.dev` (Version `ca0b833b-5d7f-4f58-baa0-dde793149a20`, Cron `*/5 * * * *`)
- **Database (D1):** `kamu_bildirim_sepeti` (`37ec183a-11be-4a6c-b0fd-caa2039677f7`, `EEUR`, `0001..0004`, 160 canli ilan: 156 acik, 4 kapali)
- **Verified Baseline Commands:**
  - `npx vitest run --no-file-parallelism`: 42/42 dosya, 421/421 test gecti (`44.28s`, `EXIT=0`)
  - `npm run lint`, `npx tsc --noEmit`, `npm run build` (53 rota), `npm run build:worker`: `EXIT=0`
  - Worker bundle: `10531.49 KiB` / gzip `2404.11 KiB`, startup `11 ms`
  - `node scripts/browser-audit.mjs`: `[AUDIT PASSED]` (14 rota HTTP 200, 20/20 matris 0 tasma, 5/5 R-35)
  - Live API & Mobile (`390x844` Chromium) checks: `/` HTTP 200 (`158957B`, tohumsuz SSR), `/api/announcements?source=iskur` (`total=36`), `?employmentType=memur_ab` (`total=47`), `/api/sync/status` (`openCount: 156`, `totalCount: 160`, `sbb activeCount: 96`), `/`, `/analiz`, `/kpss-arsivi` mobilde `overflow: false`, footer linkleri `h: 44`, `0` konsol/ag hatasi

## Current Goal
**Kamu Bildirim Sepeti** SaaS urununu canli D1 + push-ingest uzerinde temiz tutmak ve siradaki **Faz 9 Sprint 2** veya **Faz 10** adimina gecmek (**Faz 8** gelir/odeme katmani kullanici karariyla en son / demoda tutulur).

## Completed Since Last Handoff (Saha Cilasi)
- **Canli SSR & Sunucu Arama/Filtre (`src/app/page.tsx`, `src/app/api/announcements/route.ts`, `src/components/AnnouncementFeed.tsx`, `src/modules/announcements/{types,service}.ts`):** `HomePage` `force-dynamic` ile ilk 15 canli D1 ilanini SSR uzerinden yukluyor; misafir akisinda (`limitApplied=15`) arama/filtre/siralama degisince 250ms debounce + `AbortController` ile `/api/announcements` uzerinden tum 160 D1 havuzu filtreleniyor; `memur_ab` filtre destegi ve havuz bazli `openTotal`/`closedTotal`/`facets.cities`/`categoryCounts` eklendi.
- **Durum & /analiz Canli Uyumu + SBB Metin Temizligi (`src/app/api/sync/status/route.ts`, `src/components/PublicInsightsClient.tsx`, `src/modules/announcements/connectors.ts`):** `checkpoints.activeCount` canli D1 acik ilan sayisiyla hizalandi, `/analiz` ilk karti `liveSummary` ile canli `156 / 160` gosteriyor ve `parseSbbKamuIlanHtml` cift parantezli `((...))` tarih ozeti temizlendi.
- **44px Dokunma Hedefleri & Footer SBB Linki (`src/components/{AppShell,Header,SearchWorkbench}.tsx`, `tests/{field-polish.test.tsx,phase2-auth-sync.test.ts,phase7-ui.test.tsx}`):** Footer resmi kaynaklara `SBB Kamu Ilan` eklendi, 4 footer linkine ve `Header`/`SearchWorkbench` butonlarina `min-h-[44px]` verildi; 4 yeni `field-polish` testi eklendi.

## Decisions & Constraints (Do Not Re-litigate)
- **Oncelik Sirasi:** Faz 7 + Faz 9 Sprint 1 + SBB/ISKUR PDF+OCR + Saha Cilasi tamam -> Faz 9 Sprint 2 veya Faz 10 -> **Faz 8 EN SON** (odeme/e-posta demoda kalir).
- **R2 & Istemci Tam Havuz Karari (YAGNI):** R2 incremental cache ve istemciye tum 160+ ilani indirme yerine debounced `/api/announcements` sunucu filtrelemesi tercih edildi.
- **WAF / Push-Ingest Mimarisi:** `kamuilan.sbb.gov.tr` ve `api.kariyerkapisi.gov.tr` Worker egress kisiti nedeniyle `.github/workflows/sync-official-sources.yml` (`scripts/sync-remote.ts`) `POST /api/cron/ingest` uzerinden basar; `checkpoints.activeCount` canli D1 acik sayisini yansitir.
- **Marka, Hijyen & Dizin:** YALNIZCA **Kamu Bildirim Sepeti**; 0 yasakli rakip adi, 0 em-dash (`\u2014`), `AGENTS.md` 1-9. satirlari koru; gercek repo `/home/znekm/Belgeler/kpssAtama`.

## Known Risks / Open Blockers
- Canli D1 icinde daha once yazilmis bazi SBB `summary` satirlarinda cift parantez kalintisi bir sonraki `sync-official-sources.yml` / `sync:remote` calismasinda `parseSbbKamuIlanHtml` temizligiyle yenilenir.

## Next Atomic Steps
1. **Faz 9 Sprint 2 (Opsiyonel) veya Faz 10:** Kaynak bazli ayristirici hata alarm/retry akisi veya `/nitelik/[kod]` + `/kurum/[slug]` programatik SEO sayfalari (**Faz 8** en son).

## Copy-Paste Resume Prompt
> Read `HANDOFF.md`, `AGENTS.md`, `docs/PROGRESS.md`, `docs/ROADMAP.md`, and `.agents/skills/github-handoff/SKILL.md`. Run `git status --short && git log -n 5 --oneline` and `npm test && npm run lint` to confirm baseline, honor the Phase 9 > 10 > 8 priority order, and execute Next Atomic Step #1.
