# Project Handoff: Kamu Bildirim Sepeti

- **Updated:** 2026-11-26 06:20 +03:00
- **Status:** READY (Faz 1-5 tamamlandi; harici Cloudflare kurulumu ve canli yayin bekliyor)
- **Branch / Base Commit:** `main` @ `a58b771` (`origin/main` = `https://github.com/ozunekmekci/Kamu-Bildirim-Sepeti.git`)
- **Verified Baseline Commands (Faz 5):**
  - `npm test` (paralel): 30/30 dosya, 345/345 test gecti (`9.15s`, `EXIT=0`)
  - `npm run lint` & `npx tsc --noEmit`: 0 hata (`EXIT=0`)
  - `npm run build` & `npx opennextjs-cloudflare build`: `EXIT=0` (53 rota)
  - `npx wrangler deploy --dry-run`: `EXIT=0` (`custom-worker.mjs` icinde `scheduled` + 3 DO export)
  - `node scripts/browser-audit.mjs`: `[AUDIT PASSED]` (14 rota HTTP 200, 20/20 Masaustu/Mobil Acik/Koyu 0 tasma, 5/5 R-35)

## Current Goal
Kamu kurumlarinin atama, personel alimi ve gorevlendirme ilanlarini (Kariyer Kapisi, ISKUR, Resmi Gazete + `/kpss-arsivi`) profil eslestirmesiyle takip eden **Kamu Bildirim Sepeti** SaaS uygulamasini Cloudflare Workers + D1 + Cron uzerinde canli yayina almak.

## Completed Since Last Handoff (Faz 1-5)
- **Cekirdek SaaS MVP (Faz 1-2, `migrations/0001_init.sql`, `0002_phase2.sql`):** Tekil `Announcement` modeli (`src/modules/announcements/`), profil eslestirme motoru (`src/modules/matching/`), Web Crypto `kbs_session` + e-posta dogrulama / sifre sifirlama + KVKK kalici silme (`src/modules/identity/`), `Resend`/`MailChannels`/`Noop` e-posta (`src/modules/tracking/`), `Demo`/`Stripe`/`iyzico` + HMAC webhook (`src/modules/billing/`), 9.703 KPSS arsivi (`/kpss-arsivi`).
- **Web Push & Analitik/SEO (Faz 3-4, `0003_phase3.sql`):** Sifir bagimlilikli Web Crypto RFC 8291 (`aes128gcm`) & RFC 8292 (`ES256` VAPID) gonderici + 404/410 budama (`src/modules/push/`), `public/sw.js`, `/analiz`, `/sehir/[slug]`, `/kaynak/[slug]`, `GET /api/health`, `.env.example`, `scripts/setup-cloudflare.sh --generate-vapid`.
- **Worker Cron, Canli Prob & Tarayici Denetimi (Faz 5):** `custom-worker.mjs` + `src/modules/worker/scheduled.ts` (`0 */6 * * *` -> `POST /api/cron/sync`), `scripts/probe-sources.ts` (`npm run probe:sources`: canli ISKUR 12 + Resmi Gazete 16 ilan), `src/modules/db/index.ts` `WeakSet` yerel D1 fallback, oturumsuz 401 konsol gurultusu ve `/kpss-arsivi` mobil tasma (`SearchWorkbench.tsx`) duzeltmeleri.
- **Handoff & Otomatik Devam Altyapisi:** `.agents/skills/github-handoff/`, `.agents/hooks.json` (`SessionStart` otomatik `HANDOFF.md` enjeksiyonu, 12 adımda bir `PreInvocation` checkpoint uyarısı, sıfır-token `Stop` anlık durum snapshot), `HANDOFF.md`, `GEMINI.md` ve `CLAUDE.md` eklendi.

## Decisions & Constraints (Do Not Re-litigate)
- **Marka Adi:** YALNIZCA **Kamu Bildirim Sepeti**. Ucuncu taraf rakip uygulama adini kod, yorum veya dokumanlarda asla kullanma.
- **Metin Hijyeni:** Kod, UI, hata mesajlari ve dokumanlarda em-dash (`\u2014`) karakteri kullanma (0 eslesme).
- **Resmi Kaynak & Hukuk:** 3 kaynak (Kariyer Kapisi, ISKUR, Resmi Gazete) + `/kpss-arsivi`; her ilanda resmi kurum metninin baglayici oldugu uyarisi ve KVKK 5 veri kategorisi / `'SIL'` ile silme korunmali.
- **Yerel Dizin Notu:** Disk uzerindeki gercek repo yolu `/home/znekm/Belgeler/kpssAtama`'dir. Ortamda `/home/znekm/Masaüstü/kpssAtama` yolu yoksa tüm shell komutlarinda calisma dizinini `/home/znekm/Belgeler/kpssAtama` olarak ayarla.
- **Sadelik & YAGNI:** Yeni npm bagimliligi ekleme; harici servislerde adapter seam'lerini koru.
- **AGENTS.md Kurali:** `AGENTS.md` 1-9. satirlardaki Next.js blogunu koru.

## Known Risks / Open Blockers
- **Harici Cloudflare Yetkilendirmesi:** `npx wrangler whoami` yerel oturumun acik olmadigini gosteriyor; `wrangler.jsonc` icindeki `REPLACE_WITH_D1_DATABASE_ID` canli D1 kurulumu ile degistirilmeli.
- **Kariyer Kapisi Canli HTML:** `https://kariyerkapisi.gov.tr` statik HTML yerine istemci tarafli (JS-rendered) liste yukluyor; statik HTML probunda `0` ilan donuyor (ISKUR ve Resmi Gazete canli HTML'den `28` ilan cekiyor).

## Next Atomic Steps
1. Kullaniciyla birlikte Cloudflare oturumu ac ve canli D1/VAPID/Worker kurulumunu tamamla:
   - `npx wrangler login`
   - `bash scripts/setup-cloudflare.sh --generate-vapid`
   - `bash scripts/setup-cloudflare.sh --execute`
   - Tum gizli degiskenleri (`SESSION_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`/`MAILCHANNELS_API_KEY`, odeme ve VAPID + `VAPID_SUBJECT`) Cloudflare Worker'a yaz ve `npm run deploy` calistir.
2. Canli URL uzerinde `GET /api/health`, `POST /api/cron/sync` (yetkili `Authorization: Bearer`) ve `npm run probe:sources` ile uctan uca calismayi dogrula.
3. (Istege bagli sonraki sprint) Kariyer Kapisi istemci tarafi XHR/API uc noktasini inceleyip `src/modules/announcements/parsers.ts` veya fetcher katmanina ekle.

## Copy-Paste Resume Prompt
> Read `HANDOFF.md`, `AGENTS.md`, `docs/PROGRESS.md`, and `.agents/skills/github-handoff/SKILL.md`. Run `git status --short && git log -n 5 --oneline` and `npm test && npm run lint` to confirm baseline, adopt all Decisions & Constraints without re-litigating, and continue immediately from Next Atomic Step #1.
