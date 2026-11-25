# Kamu Bildirim Sepeti - İlerleme ve Devir Defteri

**Son Güncelleme:** 2026-11-26  
**Aktif Faz:** Faz 1 (Çekirdek SaaS MVP)  

## Faz 1 Tamamlananlar
- [x] **İlan Modülü (`src/modules/announcements/`):** Tekil `Announcement` şeması, 24 gerçekçi kamu ilanı (`seed.ts`: 18 `acik`, 6 `kapali`), sıfır harici bağımlılıklı HTML ayrıştırıcılar (`parsers.ts`: Kariyer Kapısı, İŞKUR, Resmî Gazete + timeout destekli `fetchOfficialAnnouncements`), filtreleme/faset/senkronizasyon servisi (`service.ts`).
- [x] **Profil Eşleştirme Motoru (`src/modules/matching/`):** `@/lib/turkish`, `@/data/departments` ve `@/data/qualifications` kullanarak eğitim düzeyi, KPSS puan/türü, ikamet ili, askerlik durumu, ehliyet, sertifika ve nitelik kodlarını (`4001`/`3001`/`2001` genel kodları ve eşdeğer kodlar dahil) değerlendiren saf eşleştirme motoru (`evaluateAnnouncementMatch`, `matchAnnouncementsForProfile`).
- [x] **Veritabanı ve D1 Şeması (`src/modules/db/`, `migrations/0001_init.sql`, `wrangler.jsonc`):** `ON DELETE CASCADE` ilişkili 8 tabloluk SQLite/D1 şeması, `D1Adapter` + `MemoryDbAdapter` + `getDb()` seam'i, `0 */6 * * *` cron yapılandırması.
- [x] **Kimlik Doğrulama ve KVKK (`src/modules/identity/`):** Edge uyumlu Web Crypto (`PBKDF2` + `HMAC-SHA256`) `kbs_session` çerez yönetimi, kayıt/giriş/profil servisi ve `'SIL'` onaylı kalıcı hesap silme akışı.
- [x] **Takip ve Bildirim Tercihleri (`src/modules/tracking/`):** İlan kaydetme/çıkarma, plan limit kontrolü, bildirim tercihleri ve `EmailAdapter` seam'i arkasında hatırlatıcı tekilleştirme.
- [x] **Plan Yetkilendirme ve Demo Faturalandırma (`src/modules/billing/`):** Ücretsiz (15 görünür ilan / 10 kayıt) ve Premium (sınırsız / profil eşleşme / anlık uyarı) kapıları ve Faz 1 `DemoPaymentAdapter`.
- [x] **API Yüzeyi (`src/app/api/**`):** 14 adet `force-dynamic` Route Handler (`auth/*`, `profile`, `account`, `announcements/*`, `saved`, `notifications/preferences`, `billing/*`, `cron/sync`).
- [x] **Arayüz, Tema, Yasal Sayfalar ve PWA (`src/app/**`, `src/components/**`):** Açık/Koyu tema (`ThemeProvider`), `/` ilan akışı (`AnnouncementFeed`), `/ilan/[id]`, `/kayitli`, `/profil`, `/ayarlar`, `/premium`, `/giris`, `/kayit`, `/kpss-arsivi` (`KpssArchiveClient`), `/gizlilik-politikasi`, `/kullanim-kosullari`, manifest/icon/opengraph/sitemap.

## Doğrulama Özeti (Faz 1 Son Doğrulama)
- [x] Yasaklı referans marka taraması: 0 eşleşme (`src/`, `tests/`, `migrations/`, `docs/`, `README.md`, `AGENTS.md`, `CLAUDE.md`)
- [x] Em-dash (`\u2014`) UI/modül/dokümantasyon metin taraması: 0 eşleşme
- [x] `npm test`: 18/18 test dosyası, 265/265 test geçti (`EXIT=0`)
- [x] `npm run lint`: 0 hata (`EXIT=0`)
- [x] `npm run build`: Next.js 16.3.5 üretim derlemesi başarılı, 30 rota derlendi (`EXIT=0`)
- [x] `npm run build:worker`: OpenNext Cloudflare Worker derlemesi başarılı, `.open-next/worker.js` üretildi (`EXIT=0`)
- [x] İki eksenli kod incelemesi (`Standards` + `Spec`) ve `antislop` denetimi: Geçti (açık/koyu tema WCAG AA kontrastı, `CRON_SECRET` fail-closed üretim koruması, 44px dokunma hedefleri, Escape kapanışları, KVKK ve 3 resmî kaynak beyanları doğrulandı)

## Üretim Ortamı Önkoşulları (Harici Kurulum)
1. Cloudflare D1 veritabanı oluşturulup gerçek `database_id` değeri `wrangler.jsonc` içine yazılmalı (`REPLACE_WITH_D1_DATABASE_ID` yerine).
2. `npx wrangler d1 migrations apply kamu_bildirim_sepeti --remote` çalıştırılmalı.
3. Cloudflare Worker ortamında `SESSION_SECRET` ve `CRON_SECRET` gizli değişkenleri tanımlanmalı.

## Sıradaki Başlangıç Adımı (Faz 2)
- [ ] Canlı Cloudflare D1 üzerinde ilk `POST /api/cron/sync` senkronizasyonunu doğrulamak ve `EmailAdapter` için gerçek Resend/MailChannels sağlayıcısını bağlamak.
