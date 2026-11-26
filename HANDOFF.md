# Project Handoff: Kamu Bildirim Sepeti

- **Updated:** 2026-11-27 01:07 +03:00
- **Status:** READY (SBB/ISKUR PDF + Turkce OCR ayristirma, gelismis kriter filtreleri, kayitli arama alarmlari ve canli Workers + D1 deploy dogrulandi)
- **Live URL:** `https://kpssportal.ozunekmekci.workers.dev` (Version `fa0469df-00ed-495b-8565-8ded9e2f92f7`, Cron `*/5 * * * *`)
- **Database (D1):** `kamu_bildirim_sepeti` (`37ec183a-11be-4a6c-b0fd-caa2039677f7`, `EEUR`, `0001..0004`, sifir SQL migrasyonu ile `criteria_json` uzerinden zenginlestirilmis SBB/ISKUR kriterleri ve alt kadrolar)
- **Verified Baseline Commands:**
  - `npx vitest run --no-file-parallelism`: 41/41 dosya, 417/417 test gecti (`46.17s`, `EXIT=0`)
  - `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run build:worker`: `EXIT=0`
  - Worker bundle: `10,462.87 KiB` / gzip `2,390.23 KiB`, startup `19 ms`
  - `node scripts/browser-audit.mjs`: `[AUDIT PASSED]` (14 rota HTTP 200, 20/20 matris 0 tasma, 5/5 R-35)
  - Canli Bozkoy SBB OCR dogrulamasi (`sbb-19e513b2ca14a4ca`, `pdfMethod: "ocr"`, `8,553` karakter): `city: "NİĞDE"`, `quota: 1`, `applyUrl: "https://www.bozkoy.bel.tr"`, `educationLevels: ["lisans"]`, `kpssScoreTypes: ["P3"]`, `minKpssScore: 65`, `driverLicenses: ["C"]`, `maxAge: 30`, `departments: ["Egzersiz ve Spor Bilimleri", "Spor Yöneticiliği", "Antrenörlük Eğitimi"]`, `positionsCount: 1`

## Current Goal
**Kamu Bildirim Sepeti** SaaS urununun SBB/ISKUR PDF+OCR kriter zenginlestirmesini canli GitHub Actions push-ingest uzerinden surdurmek ve siradaki **Faz 9 Sprint 2** veya **Faz 10** adimina gecmek (**Faz 8** gelir/odeme katmani kullanici karariyla en son / demoda tutulur).

## Completed Since Last Handoff (PDF+OCR Kriter Pipeline, Gelismis Filtreler & Kayitli Arama Alarmlari)
- **PDF Kriter Ayristirici, Eslesme Motoru v2.1 ve Tip Genisletmesi (`src/modules/announcements/{types,parsers,pdf-criteria,index}.ts`, `src/modules/matching/engine.ts`, `src/modules/db/{types,d1-adapter,memory-adapter}.ts`, `tests/pdf-criteria-and-matching.test.ts`):** `AnnouncementCriteria` (`departments`, `maxAge`, `gender`, `extractedTextExcerpt`), `AnnouncementFilter` ve `SavedSearchFilters` geriye donuk uyumlu olarak genisletildi (0 SQL migrasyonu); `enrichAnnouncementFromPdfText` saf Edge-uyumlu modul olarak eklendi; parantezli/coklu ehliyet (`(C) sınıfı`), KPSS tablo puani oncelikli taban puan ayristirma (sozlu/uygulamali 60 baraji korumasiz eslesmesi kapatildi), OCR sutun gurultusu temizlemeli bolum cikarimi ve pozisyon duzeyinde ehliyet/sertifika/bolum eslesmesi eklendi.
- **SBB/ISKUR PDF + Turkce OCR Pipeline & Artimli Uzak Sync (`scripts/pdf-extract.ts`, `scripts/sync-remote.ts`, `src/modules/announcements/connectors.ts`, `.github/workflows/sync-official-sources.yml`, `tests/pdf-extract.test.ts`, `tests/sync-remote-pdf.test.ts`):** `pdftotext` + `pdftoppm`/`tesseract -l tur` geri donuslu PDF metin cikarici, SBB `Referer` basligi ve `GET /api/cron/ingest` tabanli artimli atlama (`--pdf-limit`, `--ocr-limit`) ile GitHub Actions `poppler-utils` + `tesseract-ocr-tur` kurulumu eklendi.
- **Gelismis Kriter Filtreleri, `/ilan/[id]` PDF Sartlari UI ve Kayitli Arama Bildirimleri (`src/modules/announcements/service.ts`, `src/app/api/{announcements,saved-searches,cron/ingest}/route.ts`, `src/modules/{tracking,push}/service.ts`, `src/components/{AnnouncementFeed,AnnouncementDetailClient}.tsx`, `tests/criteria-filters-and-saved-search-alerts.test.tsx`):** `educationLevel`, `kpssScoreType`, `maxKpssScore`, `driverLicense` ve `department` filtreleri API + ana akis + kayitli aramalara baglandi; `/ilan/[id]` sayfasina cikarilan bolum/ehliyet/sertifika/yas/cinsiyet ve katlanabilir PDF metin ozeti eklendi; `saved_searches` e-posta ve Web Push bildirimleri tekillestirmeli olarak baglandi.

## Decisions & Constraints (Do Not Re-litigate)
- **Oncelik Sirasi:** Faz 7 + Faz 9 Sprint 1 + SBB/ISKUR PDF+OCR Pipeline tamam -> Faz 9 Sprint 2 (opsiyonel parser alarm webhook/bildirim) veya Faz 10 (Dusuk: `/nitelik/[kod]`, `/kurum/[slug]`, TWA/B2B) -> **Faz 8 EN SON** (odeme/e-posta demoda kalir).
- **R2 Cache (YAGNI):** OpenNext R2 incremental cache katmani mevcut ISR/SSG trafigi gerektirinceye kadar bilincli olarak ertelendi; ek bagimlilik/maliyet acilmadi.
- **WAF / Push-Ingest Mimarisi:** `kamuilan.sbb.gov.tr` ve `api.kariyerkapisi.gov.tr` datacenter IP engeli nedeniyle Worker `*/5` cron devre kesicili hizli sync yaparken `.github/workflows/sync-official-sources.yml` (`scripts/sync-remote.ts`) `pdftotext` + `tesseract-ocr-tur` ile zenginlestirilmis veriyi `POST /api/cron/ingest` uzerinden basar.
- **Marka & Hijyen:** YALNIZCA **Kamu Bildirim Sepeti**; 0 yasakli rakip adi, 0 em-dash (`\u2014`), `AGENTS.md` 1-9. satirlari koru.
- **Gizli Anahtarlar & Dizin:** Degerleri asla yazma/loglama; gercek repo `/home/znekm/Belgeler/kpssAtama`.

## Known Risks / Open Blockers
- None (GitHub Actions `CRON_SECRET` ve `SYNC_TARGET_URL` aktif; canli D1 ve Worker saglikli).

## Next Atomic Steps
1. **Faz 9 Sprint 2 (Opsiyonel) veya Faz 10:** Kaynak bazli ayristirici hata alarm/retry akisi veya `/nitelik/[kod]` + `/kurum/[slug]` programatik SEO sayfalari (**Faz 8** en son).

## Copy-Paste Resume Prompt
> Read `HANDOFF.md`, `AGENTS.md`, `docs/PROGRESS.md`, `docs/ROADMAP.md`, and `.agents/skills/github-handoff/SKILL.md`. Run `git status --short && git log -n 5 --oneline` and `npm test && npm run lint` to confirm baseline, honor the Phase 9 > 10 > 8 priority order, and execute Next Atomic Step #1.

<!-- AUTO-SNAPSHOT:START -->
## Auto-Snapshot on Stop (Zero-Token Hook)
- **Captured At (UTC):** 2026-11-26T22:07:23.408Z
- **Termination Reason:** TERMINAL_CUSTOM_HOOK
- **Branch / HEAD:** `main` @ `0ba17d9 fix(parsers): prioritize KPSS table score over exam-pass threshold and clean OCR column noise in departments` (unpushed commits: 5)
- **Last User Input:** (none)
- **Working Tree Snapshot:**
```text
 M HANDOFF.md
 M docs/PROGRESS.md
```
- **Diff Stat:**
```text
 HANDOFF.md       | 49 ++++++++++++++++++++++++++++++++++---------------
 docs/PROGRESS.md | 15 ++++++++++++++-
 2 files changed, 48 insertions(+), 16 deletions(-)
```
<!-- AUTO-SNAPSHOT:END -->
