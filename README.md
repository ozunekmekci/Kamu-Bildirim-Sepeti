# Kamu Bildirim Sepeti

**Kamu Bildirim Sepeti**, kamu kurumları tarafından yayımlanan **atama**, **personel alımı** ve **görevlendirme** ilanlarını tek merkezden takip etmeyi, aday profiline göre uygunluk eşleştirmesi yapmayı ve son başvuru takibini kolaylaştıran bir SaaS platformudur.

## Resmî Kaynaklar ve Kapsam
Platform aşağıdaki resmî kamu kaynaklarından derlenen ilan yapılarını ve mevcut KPSS yerleştirme arşivini bir araya getirir:
- **Kariyer Kapısı:** https://kariyerkapisi.gov.tr
- **Türkiye İş Kurumu (İŞKUR):** https://www.iskur.gov.tr/
- **T.C. Resmî Gazete:** https://www.resmigazete.gov.tr/
- **ÖSYM KPSS Arşivi (`/kpss-arsivi`):** Mevcut merkezi yerleştirme kadroları, taban puan analizi ve nitelik kodu arama aracı

> Her ilanın güncel, eksiksiz ve bağlayıcı hâli ilgili kamu kurumunun resmî internet sitesinde yayımlanan metindir. Kamu Bildirim Sepeti üzerinde gösterilen bilgiler ile resmî kaynak arasında farklılık bulunması hâlinde resmî kaynak esas alınmalıdır.

## Teknoloji Yığını
- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript 5
- **Stil:** Tailwind CSS v4 (Açık ve Koyu tema destekli)
- **Çalışma Ortamı & Veritabanı:** OpenNext Cloudflare Workers (`custom-worker.mjs` + `scheduled()` Cron giriş noktası) + Cloudflare D1 (`migrations/0001_init.sql`, `migrations/0002_phase2.sql`, `migrations/0003_phase3.sql`) + Cron Triggers (`0 */6 * * *`)
- **Kimlik Doğrulama & Güvenlik:** Edge uyumlu Web Crypto (`PBKDF2` SHA-256 + `HMAC-SHA256`), `kbs_session` HttpOnly/SameSite=Lax çerezi, tek kullanımlık e-posta doğrulama ve parola sıfırlama token akışları (`/eposta-dogrula`, `/sifre-sifirla`), self-servis KVKK hesap silme
- **E-posta, Ödeme ve Web Push:** `Resend` / `MailChannels` / `Noop` e-posta adaptörleri; `Demo` / `Stripe` / `iyzico` ödeme adaptörleri ve Web Crypto HMAC webhook doğrulaması; `public/sw.js` Service Worker + `push_subscriptions` + sıfır bağımlılıklı Web Crypto RFC 8291 (`aes128gcm`) & RFC 8292 (`ES256` VAPID) göndericisi (`404`/`410` otomatik budama ve `POST /api/cron/sync` entegrasyonu)
- **Resmî Kaynak Ayrıştırma, Tanılama ve Sağlık İzleme:** `application/ld+json` `JobPosting`, RSS/Atom geri dönüş desteği ve Resmî Gazete PDF fihrist ayrıştırması; `npm run probe:sources` canlı kaynak probu, gizli değer sızdırmayan `GET /api/health` uç noktası ve `/ayarlar` altyapı hazırlığı şeridi
- **Analitik ve Programatik SEO:** Gerçek veri setlerinden hesaplanan `/analiz` panosu, `/sehir/[slug]` il sayfaları, `/kaynak/[slug]` resmî kaynak sayfaları ve canlı profil senaryo karşılaştırması
- **Test ve Tarayıcı Denetimi:** Vitest + Testing Library + sıfır bağımlılıklı headless Chromium denetimi (`node scripts/browser-audit.mjs`)

## Yerel Geliştirme

```bash
npm install
npm run dev
```

Yerel geliştirme, test ve migrate edilmemiş yerel D1 durumunda `src/modules/db/` otomatik olarak bellek içi `MemoryDbAdapter` adaptörüne düşer.

### Doğrulama Komutları

```bash
npm test
npm run lint
npm run build
npm run build:worker
npm run probe:sources
node scripts/browser-audit.mjs
```

## Cloudflare D1 Kurulumu ve Dağıtım

Otomatik kurulum önizlemesi ve adımları için `scripts/setup-cloudflare.sh` betiğini kullanabilirsiniz (varsayılan `--dry-run` modunda çalışır, VAPID anahtarı üretmek için `--generate-vapid`, canlı uygulama için `--execute` verilir; örnek ortam değişkenleri `.env.example` dosyasında listelenir):

```bash
bash scripts/setup-cloudflare.sh --generate-vapid
bash scripts/setup-cloudflare.sh
```

Manuel adımlar:
1. Cloudflare D1 veritabanı oluşturun:
```bash
npx wrangler d1 create kamu_bildirim_sepeti
```
2. Çıktıdaki `database_id` değerini `wrangler.jsonc` içindeki `REPLACE_WITH_D1_DATABASE_ID` alanına yazın.
3. Şema migrasyonlarını (`0001_init.sql`, `0002_phase2.sql` ve `0003_phase3.sql`) uygulayın:
```bash
npx wrangler d1 migrations apply kamu_bildirim_sepeti --local
npx wrangler d1 migrations apply kamu_bildirim_sepeti --remote
```
4. Worker ortam ve gizli değişkenlerini tanımlayın:
```bash
npx wrangler secret put SESSION_SECRET
npx wrangler secret put CRON_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put MAILCHANNELS_API_KEY
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put IYZICO_API_KEY
npx wrangler secret put IYZICO_SECRET_KEY
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT
```
   - `SESSION_SECRET`: Oturum çerezi (`kbs_session`) HMAC-SHA256 imzalama anahtarı (en az 32 bayt rastgele değer önerilir).
   - `CRON_SECRET`: `POST /api/cron/sync` uç noktasını `Authorization: Bearer <secret>` veya `x-cron-secret` başlığıyla korumak için kullanılır.
   - `RESEND_API_KEY` / `MAILCHANNELS_API_KEY` / `EMAIL_FROM`: Canlı hatırlatma, anlık ilan uyarısı, e-posta doğrulama ve parola sıfırlama gönderimi için kullanılır (anahtar yoksa `NoopEmailAdapter` seçilir).
   - `PAYMENT_PROVIDER` (`demo` | `stripe` | `iyzico`), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL`: Ödeme adaptörü ve fail-closed webhook doğrulaması için kullanılır.
   - `VAPID_PUBLIC_KEY` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`: Tarayıcı anlık bildirimleri (Web Push) RFC 8291/8292 VAPID anahtar çifti ve iletişim adresi (`mailto:` veya `https://`) yapılandırması için kullanılır (tanımlı değilse `/ayarlar` arayüzünde dürüst bilgi durumu gösterilir).
5. Worker derleme ve yayınlama:
```bash
npm run build:worker
npm run deploy
```

## Faz 2, Faz 3 ve Faz 4 Rotaları
- **Faz 2 Sayfaları:** `/sifre-sifirla`, `/eposta-dogrula` (mevcut `/`, `/ilan/[id]`, `/kayitli`, `/profil`, `/ayarlar`, `/premium`, `/giris`, `/kayit`, `/kpss-arsivi` sayfalarına ek olarak)
- **Faz 3 Sayfaları:** `/analiz` (açık veri ve kadro içgörüleri), `/sehir/[slug]` (il bazlı ilan ve KPSS arşivi), `/kaynak/[slug]` (resmî kaynak bazlı ilanlar), `/profil` üzerinde senaryo karşılaştırma, `/ayarlar` üzerinde Web Push yönetimi
- **API Uç Noktaları:** `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `GET /api/sync/status`, `GET /api/health`, `POST /api/billing/checkout`, `POST /api/billing/webhook/stripe`, `POST /api/billing/webhook/iyzico`, `GET /api/push/vapid-key`, `GET|POST|DELETE /api/push/subscriptions`

## Dokümantasyon ve Ajan Devir Dosyaları
- [HANDOFF.md](HANDOFF.md): Yeni oturum / farklı AI ajanları için 30 saniyelik aktif durum, kararlar ve sonraki adımlar devir özeti
- [GEMINI.md](GEMINI.md) ve [CLAUDE.md](CLAUDE.md): Antigravity/Gemini CLI/Claude Code oturum açılışında `AGENTS.md` ve `HANDOFF.md` dosyalarını otomatik bağlayan kök kurallar
- [.agents/hooks.json](.agents/hooks.json) ve [.agents/skills/github-handoff/SKILL.md](.agents/skills/github-handoff/SKILL.md): Otomatik `SessionStart` devam enjeksiyonu, 12 adımda bir kontrol uyarısı ve token bitiminde sıfır-token `Stop` anlık durum kaydı (`github-handoff`)
- [AGENTS.md](AGENTS.md): Ajan kuralları, mimari modül haritası ve doğrulama sözleşmesi
- [docs/PROGRESS.md](docs/PROGRESS.md): Canlı ilerleme ve faz bazlı devir defteri
- [docs/ROADMAP.md](docs/ROADMAP.md): Faz 1-5 ürün ve altyapı yol haritası
- [docs/superpowers/specs/2026-11-26-kamu-bildirim-sepeti-design.md](docs/superpowers/specs/2026-11-26-kamu-bildirim-sepeti-design.md): Faz 1 mimari ve ürün tasarım dokümanı
