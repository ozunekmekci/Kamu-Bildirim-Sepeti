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
- **Çalışma Ortamı & Veritabanı:** OpenNext Cloudflare Workers + Cloudflare D1 (`migrations/0001_init.sql`) + Cron Triggers (`0 */6 * * *`)
- **Kimlik Doğrulama & Güvenlik:** Edge uyumlu Web Crypto (`PBKDF2` SHA-256 + `HMAC-SHA256`), `kbs_session` HttpOnly/SameSite=Lax çerezi, self-servis KVKK hesap silme
- **Test:** Vitest + Testing Library

## Yerel Geliştirme

```bash
npm install
npm run dev
```

Yerel geliştirme ve test ortamında Cloudflare D1 bağlamı yoksa `src/modules/db/` otomatik olarak bellek içi `MemoryDbAdapter` adaptörüne düşer.

### Doğrulama Komutları

```bash
npm test
npm run lint
npm run build
npm run build:worker
```

## Cloudflare D1 Kurulumu ve Dağıtım

1. Cloudflare D1 veritabanı oluşturun:
```bash
npx wrangler d1 create kamu_bildirim_sepeti
```
2. Çıktıdaki `database_id` değerini `wrangler.jsonc` içindeki `REPLACE_WITH_D1_DATABASE_ID` alanına yazın.
3. Şema migrasyonlarını uygulayın:
```bash
npx wrangler d1 migrations apply kamu_bildirim_sepeti --local
npx wrangler d1 migrations apply kamu_bildirim_sepeti --remote
```
4. Worker gizli ortam değişkenlerini tanımlayın:
```bash
npx wrangler secret put SESSION_SECRET
npx wrangler secret put CRON_SECRET
```
   - `SESSION_SECRET`: Oturum çerezi (`kbs_session`) HMAC-SHA256 imzalama anahtarı (en az 32 bayt rastgele değer önerilir).
   - `CRON_SECRET`: `POST /api/cron/sync` uç noktasını `Authorization: Bearer <secret>` veya `x-cron-secret` başlığıyla korumak için kullanılır.
5. Worker derleme ve yayınlama:
```bash
npm run build:worker
npm run deploy
```

## Dokümantasyon ve Ajan Devir Dosyaları
- [AGENTS.md](AGENTS.md): Ajan kuralları, mimari modül haritası ve doğrulama sözleşmesi
- [docs/PROGRESS.md](docs/PROGRESS.md): Canlı ilerleme ve devir defteri
- [docs/ROADMAP.md](docs/ROADMAP.md): 3 fazlı ürün ve altyapı yol haritası
- [docs/superpowers/specs/2026-11-26-kamu-bildirim-sepeti-design.md](docs/superpowers/specs/2026-11-26-kamu-bildirim-sepeti-design.md): Faz 1 mimari ve ürün tasarım dokümanı
