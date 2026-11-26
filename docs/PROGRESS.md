# Kamu Bildirim Sepeti - İlerleme ve Devir Defteri

**Son Güncelleme:** 2026-11-26  
**Aktif Faz:** Faz 5 (Cloudflare Cron `scheduled()` Giriş Noktası, Canlı Kaynak Probu ve Gerçek Tarayıcı Doğrulaması)

## Faz 5 Tamamlananlar
- [x] **Cloudflare Cron `scheduled()` Worker Sarmalayıcısı (`custom-worker.mjs`, `src/modules/worker/scheduled.ts`, `wrangler.jsonc`):** OpenNext çıktı worker'ının yalnızca `fetch()` dışa aktarması nedeniyle `0 */6 * * *` cron tetikleyicisinin üretimde sessiz kalmasını önleyen özel giriş noktası eklendi (`DOQueueHandler`, `DOShardedTagCache`, `BucketCachePurge` yeniden ihracı + `ctx.waitUntil` içinde `POST /api/cron/sync` çağrısı, `Authorization: Bearer` ve `x-cron-trigger: cloudflare_cron` / `cf-cron` başlıkları, gizli anahtar sızdırmayan güvenli hata kaydı); `tests/phase5-worker-cron.test.ts` (6 test) ve `npx wrangler deploy --dry-run` paket doğrulaması geçti.
- [x] **Canlı Resmî Kaynak Probu ve Ayrıştırıcı İyileştirmeleri (`scripts/probe-sources.ts`, `package.json`, `src/modules/announcements/parsers.ts`, `tests/phase5-live-parsers.test.ts`):** `npm run probe:sources` (`--offline`, `--strict`, `--json`, 10sn timeout, güvenli WAF/ağ tanısı) eklendi; canlı HTML çıktısı sonrası `resolveUrl`, `stripLayoutChrome`, `hasCardClassToken` ve `extractWrappedCardAnchors` cerrahi olarak sertleştirildi (canlı İŞKUR `12`, Resmî Gazete `16` toplam `28` ilan ayrıştırıldı; Kariyer Kapısı statik kabuk/JS render olarak tanılı raporlandı; `npx wrangler whoami` ile CLI oturumunun henüz açılmadığı tespit edildi).
- [x] **Gerçek Tarayıcı (`antislop` R-35) Denetimi, Yerel D1 Fallback ve 401/Mobil Taşma Düzeltmeleri (`scripts/browser-audit.mjs`, `src/modules/db/index.ts`, `src/components/**`, `src/app/**`):**
  - `src/modules/db/index.ts` içine `WeakSet` önbellekli şema kontrolü (`SELECT 1 FROM announcements LIMIT 1`) eklendi; migrate edilmemiş yerel Miniflare `env.DB` altında `next start` artık `MemoryDbAdapter` adaptörüne zarifçe düşer (`tests/phase5-db-fallback.test.ts`).
  - `AnnouncementFeed.tsx`, `/profil`, `/kayitli`, `/premium` ve `/ayarlar` içinde `/api/auth/me` ön kontrolü ile oturumsuz ilk yüklemedeki 401 ağ/konsol gürültüsü sıfırlandı (mock test uyumu korundu).
  - `/kpss-arsivi` mobilde (`390px`) tespit edilen `421px` taşma `src/components/SearchWorkbench.tsx` mod seçici şeridinde `flex flex-wrap max-w-full` ile giderildi (`390 <= 390`).

## Doğrulama Özeti (Faz 5 Son Doğrulama)
- [x] Yasaklı referans marka taraması: 0 eşleşme (`src/`, `custom-worker.mjs`, `scripts/*`, `docs/`, `README.md`, `AGENTS.md`, `tests/`, `.env.example`, `wrangler.jsonc`, `package.json`)
- [x] Em-dash (`\u2014`) metin taraması: 0 eşleşme (`src/`, `custom-worker.mjs`, `scripts/*`, `README.md`, `.env.example`, `AGENTS.md` satır 10+, `docs/PROGRESS.md`, `docs/ROADMAP.md`)
- [x] Varsayılan paralel `npm test`: **30/30 test dosyası, 345/345 test geçti (`EXIT=0`, `9.15s`)**
- [x] `npm run lint` ve `npx tsc --noEmit`: 0 hata (`EXIT=0`)
- [x] `npm run build` ve `npx opennextjs-cloudflare build`: Başarılı (`EXIT=0`, 53 statik/SSG rota)
- [x] `npx wrangler deploy --dry-run --outdir /tmp/kbs-wrangler-dry-run`: Başarılı (`33310.23 KiB` / gzip `3703.20 KiB`, pakette `scheduled`, `handleScheduledSync`, `DOQueueHandler`, `DOShardedTagCache`, `BucketCachePurge` doğrulandı)
- [x] Gerçek Chromium headless denetimi (`node scripts/browser-audit.mjs`): **`[AUDIT PASSED]`** (13 rota + `/ilan/kk-2026-101` HTTP 200, 0 konsol/sayfa/4xx-5xx hatası, Desktop `1440x900` + Mobile `390x844` Açık/Koyu 20/20 matriste 0 taşma, 5/5 R-35 etkileşimi geçti, 4 ekran görüntüsü görsel incelendi)
- [x] İki eksenli kod incelemesi (`Standards` + `Spec`) ve `antislop` denetimi: Geçti

## Faz 4 Tamamlananlar
- [x] **Sıfır Bağımlılıklı Web Crypto VAPID & RFC 8291 Push (`src/modules/push/`, `src/app/api/cron/sync/route.ts`):** `src/modules/push/vapid.ts` içinde standart Web Crypto (`crypto.subtle`, `crypto.getRandomValues`) ile `bytesToBase64Url`, `base64UrlToBytes`, `generateVapidKeyPair`, RFC 8292 ES256 JWT imzalayıcı `createVapidAuthHeader` ve RFC 8291 (`aes128gcm`) `encryptPushPayload` uygulandı; `VapidWebPushAdapter`, `createWebPushAdapter`, `404`/`410` otomatik abonelik budama (`dispatchPushNotification`) ve Premium/profil/tekilleştirme (`push_new_announcement`) kurallı `dispatchPushForNewAnnouncements` eklenerek `POST /api/cron/sync` (`pushAlerts`) içine bağlandı.
- [x] **Resmî Kaynak Ayrıştırıcı Kalibrasyonu (`src/modules/announcements/parsers.ts`):** `tests/announcements.test.ts` uyumluluğu korunarak `application/ld+json` `JobPosting` ayrıştırması, RSS `<item>` / Atom `<entry>` XML geri dönüş desteği, Resmî Gazete `fihrist-item` PDF bağlantı çıkarımı ile kurum/başlık ayrımı ve `fetchOfficialAnnouncements` için `User-Agent` başlığı eklendi.
- [x] **Sağlık Uç Noktası, Ortam Şablonu ve Cloudflare Kurulum Aracı (`src/app/api/health/route.ts`, `.env.example`, `scripts/setup-cloudflare.sh`):** Gizli anahtar değerlerini sızdırmadan yalnızca sağlayıcı adları ile hazır olma bayraklarını döndüren `force-dynamic` `GET /api/health`, Faz 1-4 için 17 değişkenli `.env.example` ve `0001_init.sql + 0002_phase2.sql + 0003_phase3.sql` + `--generate-vapid` (P-256 Web Crypto anahtar üretimi) destekli `scripts/setup-cloudflare.sh` tamamlandı.
- [x] **Ayarlar Altyapı Hazırlığı Şeridi ve Test Stabilizasyonu (`src/app/ayarlar/page.tsx`, `tests/phase4-*.test.*`, `tests/search-engine-empirical-challenge.test.ts`):** `/ayarlar` içindeki `Resmî Kaynak Senkronizasyon Durumu` kartına canlı `GET /api/health` tabanlı 4 etiketli `Sistem Altyapı Hazırlığı` (`Veritabanı`, `E-posta`, `Ödeme`, `Web Push`) şeridi ve hata durumunda zarif geri dönüş eklendi; paralel Vitest CPU çekişmesi için `search-engine-empirical-challenge.test.ts` eşiği stabilize edildi.

## Doğrulama Özeti (Faz 4 Son Doğrulama)
- [x] Yasaklı referans marka taraması: 0 eşleşme (`src/`, `tests/`, `migrations/`, `docs/`, `public/`, `scripts/`, `.env.example`)
- [x] Em-dash (`\u2014`) metin taraması: 0 eşleşme (`src/app/**`, `src/components/**`, `src/modules/**`, `public/sw.js`, `scripts/setup-cloudflare.sh`, `.env.example`, `docs/`, `README.md`, `AGENTS.md` satır 10+)
- [x] Varsayılan paralel `npm test`: **27/27 test dosyası, 331/331 test geçti (`EXIT=0`, `8.08s`)**
- [x] `npm run lint`: 0 hata (`EXIT=0`)
- [x] `npm run build`: Next.js 16.3.5 üretim derlemesi başarılı (`EXIT=0`)
- [x] `npx opennextjs-cloudflare build`: Başarılı, `.open-next/worker.js` üretildi (`2278` bayt, `EXIT=0`)
- [x] Kurulum betiği doğrulaması (`bash -n scripts/setup-cloudflare.sh && bash scripts/setup-cloudflare.sh --dry-run && bash scripts/setup-cloudflare.sh --generate-vapid`): `EXIT=0`
- [x] İki eksenli kod incelemesi (`Standards` + `Spec`) ve `antislop` denetimi: Geçti (`/api/health` sıfır secret sızıntısı, RFC 8291/8292 Web Crypto doğruluğu ve 410 budama, parser geri dönüş güvenliği, `.env.example` bütünlüğü, `/ayarlar` WCAG AA ve zarif hata düşüşü doğrulandı)

## Faz 3 Tamamlananlar
- [x] **Veritabanı ve Push Migrasyonu (`migrations/0003_phase3.sql`, `src/modules/db/`):** `push_subscriptions` tablosu (`ON DELETE CASCADE`, tekil `endpoint`) ve `idx_push_subscriptions_user_id` indeksi eklendi; `PushSubscriptionRecord` tipi ile `upsertPushSubscription`, `listPushSubscriptionsByUser`, `deletePushSubscriptionByEndpoint`, `listAllPushSubscriptions` yöntemleri `D1Adapter` ve `MemoryDbAdapter` içine işlendi; her iki `deleteUser` akışı `push_subscriptions` temizliğini içerecek şekilde güncellendi (9 tablo).
- [x] **Web Push Modülü, Service Worker ve API (`public/sw.js`, `src/modules/push/`, `src/app/api/push/**`):** Çevrimdışı/PWA bildirimleri için hafif `public/sw.js` (`skipWaiting`, `clients.claim`, `push` JSON ayrıştırma + güvenli varsayılanlar, `notificationclick`), `getPublicVapidKey`, HTTPS uç nokta ve `p256dh`/`auth` doğrulamalı `subscribeUserPush`, `unsubscribeUserPush`, `listUserPushSubscriptions`, `dispatchPushNotification`, `WebPushAdapter` seam'i (`NoopWebPushAdapter`, `InMemoryWebPushAdapter`), `GET /api/push/vapid-key` ve oturum korumalı `GET`/`POST`/`DELETE /api/push/subscriptions` uç noktaları eklendi.
- [x] **Analitik ve Programatik SEO Motoru (`src/modules/analytics/`, `src/app/sitemap.ts`):** `PLACEMENTS`/`INITIAL_ANNOUNCEMENTS`/`QUALIFICATIONS_BY_CODE` verilerinden doğrudan hesaplanan `getPublicInsightsSummary`, 81 ili kapsayan `slugifyTurkishCity` + `getCitySeoCatalog`, `getCityLandingData`, `getSourceLandingData` ve `compareProfileScenarios` eklendi; `sitemap.ts` ana sayfayı `/` indeks `0` konumunda koruyarak `/analiz`, `/kaynak/*` ve ilk 15 `/sehir/*` rotalarını ekledi.
- [x] **Faz 3 Arayüz Sayfaları ve SEO Rotaları (`src/app/**`, `src/components/**`):** `AppShell` navigasyon/altbilgi bağlantıları genişletildi; `/analiz` (`PublicInsightsClient`), SSG destekli `/sehir/[slug]` (ilk 30 il) ve `/kaynak/[slug]` (3 resmî kaynak) sayfaları bağlayıcı metin uyarısıyla eklendi; `/ayarlar` içine dürüst VAPID durumlu `Tarayıcı Anlık Bildirimleri (Web Push)` kartı ve `/profil` altına canlı `Senaryo Karşılaştırma (Puan / İl / Ehliyet Etkisi)` paneli eklendi.

## Doğrulama Özeti (Faz 3 Son Doğrulama)
- [x] Yasaklı referans marka taraması: 0 eşleşme (`src/`, `tests/`, `migrations/`, `docs/`, `public/`, `scripts/`)
- [x] Em-dash (`\u2014`) metin taraması: 0 eşleşme (`src/app/**`, `src/components/**`, `src/modules/**`, `public/sw.js`, `docs/`, `README.md`, `AGENTS.md` satır 10+)
- [x] SQLite şema doğrulaması (`0001_init.sql` + `0002_phase2.sql` + `0003_phase3.sql`): Bellek içi Python `sqlite3` (`PRAGMA foreign_keys = ON`) üzerinde 11 tablo temiz uygulandı, `PRAGMA foreign_key_check = []`
- [x] `npx vitest run --no-file-parallelism`: 24/24 test dosyası, 312/312 test geçti (`EXIT=0`, `30.21s`); izole `npx vitest run tests/search-engine-empirical-challenge.test.ts` 32/32 geçti (`EXIT=0`) (Not: varsayılan 24 paralel worker çalıştırmasında CPU çekişmesi nedeniyle mevcut `search-engine-empirical-challenge.test.ts` 5.5 mikro-benchmarkı `< 5.0ms` hedefini `7.48ms` / `8.33ms` ile aştı, Faz 3 koduna dokunulmadı)
- [x] `npm run lint`: 0 hata (`EXIT=0`)
- [x] `npm run build`: Next.js 16.3.5 üretim derlemesi başarılı, 53 statik/SSG sayfa derlendi (`EXIT=0`)
- [x] `npx opennextjs-cloudflare build`: Başarılı, `.open-next/worker.js` üretildi (`2278` bayt, `EXIT=0`)
- [x] İki eksenli kod incelemesi (`Standards` + `Spec`) ve `antislop` denetimi: Geçti (HTTPS endpoint + key doğrulamalı push uç noktaları, 9 tablolu KVKK silme, sıfır uydurma istatistik, async `params`, çift tema WCAG AA kontrastı ve 44px dokunma hedefleri doğrulandı)

## Faz 2 Tamamlananlar
- [x] **Veritabanı ve Migrasyonlar (`migrations/0002_phase2.sql`, `src/modules/db/`):** `users.email_verified_at`, `subscriptions.external_subscription_id`, `auth_tokens` ve `sync_runs` tabloları eklendi; `D1Adapter` ve `MemoryDbAdapter` için `markEmailVerified`, `updateUserPassword`, `createAuthToken`, `findAuthTokenByHash`, `markAuthTokenUsed`, `recordSyncRun` ve `listSyncRuns` yöntemleri uygulandı.
- [x] **E-posta Doğrulama ve Parola Sıfırlama (`src/modules/identity/`, `src/app/api/auth/**`):** Web Crypto tek kullanımlık token üretimi ve SHA-256 hash saklama (`issueAuthToken`, `requestEmailVerification`, `verifyEmailWithToken`, `requestPasswordReset`, `resetPasswordWithToken`), kullanıcı varlığını sızdırmayan `POST /api/auth/forgot-password`, tüm aktif oturumları iptal eden `POST /api/auth/reset-password`, `POST /api/auth/verify-email`, `POST /api/auth/resend-verification` ve `GET /api/sync/status` uç noktaları eklendi.
- [x] **Gerçek E-posta Adaptörleri ve Anlık Uyarılar (`src/modules/tracking/`):** `ResendEmailAdapter`, `MailChannelsEmailAdapter` ve `createEmailAdapter()` eklendi; `dispatchNewAnnouncementAlerts` ile tekilleştirilmiş (`reminderType = 'new_announcement'`) ve profil eşleştirmeli anlık yeni ilan bildirimleri bağlandı.
- [x] **Ödeme Adaptörleri, Webhook Güvenliği ve Cron Kaydı (`src/modules/billing/`, `src/app/api/billing/**`, `src/app/api/cron/sync/route.ts`):** `StripePaymentAdapter` (Checkout Session + Web Crypto HMAC-SHA256 `verifyStripeWebhookSignature` 300sn pencere) ve `IyzicoPaymentAdapter` (`IYZWSv2` + `verifyIyzicoWebhookSignature`) eklendi; `POST /api/billing/checkout`, fail-closed `POST /api/billing/webhook/stripe` (`503`/`400`), fail-closed `POST /api/billing/webhook/iyzico` (`503`/`401`) ve `sync_runs` kaydı tutan `POST /api/cron/sync` tamamlandı.
- [x] **Faz 2 Arayüz Sayfaları ve Altyapı Betiği (`src/app/**`, `scripts/setup-cloudflare.sh`):** `<Suspense>` sarmallı `/sifre-sifirla` ve `/eposta-dogrula` sayfaları, `/giris` üzerinde "Parolamı Unuttum" bağlantısı, `/ayarlar` üzerinde E-posta Doğrulama Durumu ve Resmî Kaynak Senkronizasyon Durumu kartları, `/premium` üzerinde checkout yönlendirme/demo akışı ve `--dry-run` varsayılanlı `scripts/setup-cloudflare.sh` kurulum betiği eklendi.

## Doğrulama Özeti (Faz 2 Son Doğrulama)
- [x] Yasaklı referans marka taraması: 0 eşleşme (`src/`, `tests/`, `migrations/`, `docs/`, `scripts/`, `README.md`, `AGENTS.md`)
- [x] Em-dash (`\u2014`) metin taraması: 0 eşleşme (`src/app/**`, `src/components/**`, `src/modules/**`, `docs/`, `README.md`, `AGENTS.md`)
- [x] SQLite şema doğrulaması (`0001_init.sql` + `0002_phase2.sql`): Bellek içi Python `sqlite3` (`PRAGMA foreign_keys = ON`) üzerinde 10 tablo temiz uygulandı, `FK_CHECK=[]`
- [x] `npm test`: 21/21 test dosyası, 292/292 test geçti (`EXIT=0`)
- [x] `npm run lint`: 0 hata (`EXIT=0`)
- [x] `npm run build`: Next.js 16.3.5 üretim derlemesi başarılı (`EXIT=0`)
- [x] `npx opennextjs-cloudflare build`: Başarılı, `.open-next/worker.js` üretildi (`EXIT=0`)
- [x] İki eksenli kod incelemesi (`Standards` + `Spec`) ve `antislop` denetimi: Geçti (fail-closed webhook imza doğrulaması, non-enumerating parola sıfırlama, oturum iptali, çift tema WCAG AA kontrastı, 44px dokunma hedefleri doğrulandı)

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

## Üretim Ortamı Önkoşulları ve Gizli Değişkenler (Harici Kurulum)
1. Cloudflare D1 veritabanı oluşturulup gerçek `database_id` değeri `wrangler.jsonc` içine yazılmalı (`REPLACE_WITH_D1_DATABASE_ID` yerine) veya `bash scripts/setup-cloudflare.sh --execute` kullanılmalı.
2. `npx wrangler d1 migrations apply kamu_bildirim_sepeti --remote` komutu ile `0001_init.sql`, `0002_phase2.sql` ve `0003_phase3.sql` uygulanmalı.
3. Cloudflare Worker ortamında aşağıdaki ortam/gizli değişkenleri tanımlanmalı:
   - Zorunlu güvenlik: `SESSION_SECRET`, `CRON_SECRET`
   - E-posta sağlayıcıları: `RESEND_API_KEY` veya `MAILCHANNELS_API_KEY`, `EMAIL_FROM`
   - Ödeme sağlayıcıları: `PAYMENT_PROVIDER` (`demo` | `stripe` | `iyzico`), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL`
   - Web Push (VAPID): `VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

## Sıradaki Başlangıç Adımı (Canlı Kurulum ve Dağıtım)
- [ ] Harici Cloudflare oturumu ve canlı dağıtım: `npx wrangler login`, `bash scripts/setup-cloudflare.sh --generate-vapid`, `bash scripts/setup-cloudflare.sh --execute`, tüm üretim gizli değişkenlerinin (`SESSION_SECRET`, `CRON_SECRET`, e-posta/ödeme/VAPID anahtarları ve `VAPID_SUBJECT`) tanımlanması, `npm run deploy` ve canlı alanda `POST /api/cron/sync` + `npm run probe:sources` kontrolü.
- [ ] (İsteğe bağlı sonraki sprint) Kariyer Kapısı canlı liste uç noktası JS-rendered kabuk arkasındaki XHR/API sözleşmesinin incelenmesi ve eklenmesi.
