# Kamu Bildirim Sepeti - İlerleme ve Devir Defteri

**Son Güncelleme:** 2026-11-26  
**Aktif Faz:** Faz 2 (Canlı Sync, E-posta Adaptörleri, Parola Sıfırlama ve Ödeme Adaptörleri)

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
2. `npx wrangler d1 migrations apply kamu_bildirim_sepeti --remote` komutu ile `0001_init.sql` ve `0002_phase2.sql` uygulanmalı.
3. Cloudflare Worker ortamında aşağıdaki ortam/gizli değişkenleri tanımlanmalı:
   - Zorunlu güvenlik: `SESSION_SECRET`, `CRON_SECRET`
   - E-posta sağlayıcıları: `RESEND_API_KEY` veya `MAILCHANNELS_API_KEY`, `EMAIL_FROM`
   - Ödeme sağlayıcıları: `PAYMENT_PROVIDER` (`demo` | `stripe` | `iyzico`), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL`

## Sıradaki Başlangıç Adımı (Faz 3)
- [ ] Canlı Cloudflare D1 üzerinde `migrations/0001_init.sql` ve `migrations/0002_phase2.sql` uygulayıp `scripts/setup-cloudflare.sh` ile üretim secret yapılandırmasını tamamlayarak ilk canlı `POST /api/cron/sync`, e-posta gönderimi ve ödeme webhook uçtan uca akışını doğrulamak.
