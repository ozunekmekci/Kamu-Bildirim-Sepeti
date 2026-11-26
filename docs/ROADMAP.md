# Kamu Bildirim Sepeti - Ürün ve Altyapı Yol Haritası

## Faz 1: Çekirdek SaaS MVP (Mevcut Hedef)
- Tekil ilan veri modeli ve 3 resmî kaynak (`Kariyer Kapısı`, `İŞKUR`, `Resmî Gazete`) HTML ayrıştırıcıları + 24 gerçekçi başlangıç ilanı
- Mevcut 9.703 KPSS merkezi yerleştirme kadrosu arşivinin `/kpss-arsivi` altında korunması
- Aday profili tabanlı uygunluk değerlendirme motoru (`matching`)
- Edge uyumlu kimlik doğrulama, KVKK veri envanteri ve self-servis hesap silme (`identity`)
- Kayıtlı ilanlar, bildirim tercihleri ve yaklaşan son başvuru takibi (`tracking` + `EmailAdapter` seam)
- Ücretsiz / Premium plan yetkilendirme kapısı (`billing` + `DemoPaymentAdapter` seam)
- Açık ve koyu temalı, mobil uyumlu Next.js 16 + Cloudflare Workers + D1 uygulaması

## Faz 2: Canlı Veri Senkronizasyonu, E-posta ve Ödeme Entegrasyonu
- Cloudflare D1 üretim veritabanı kurulumu ve `0 */6 * * *` Cron Trigger ile otomatik resmi kaynak senkronizasyonu
- Kaynak bazlı HTML değişiklik izleme, hata alarmı ve manuel yeniden deneme paneli
- `EmailAdapter` yerine Resend veya MailChannels entegrasyonu ile günlük/anlık e-posta bildirimleri ve son başvuru hatırlatmaları
- `PaymentAdapter` yerine iyzico / Stripe abonelik ödeme akışı ve webhook doğrulaması
- E-posta doğrulama ve parola sıfırlama akışları

## Faz 3: Web Push, Gelişmiş Analitik ve SEO Genişlemesi
- PWA Service Worker üzerinden tarayıcı anlık bildirimleri (Web Push + RFC 8291/8292 sıfır bağımlılıklı Web Crypto göndericisi)
- Kurum, şehir ve nitelik kodu bazlı geçmiş alım yoğunluğu ve taban puan eğilim panoları
- Dinamik il/kurum/nitelik kodu iniş sayfaları ve otomatik sitemap genişletmesi
- Kurumsal / danışmanlık hesapları için çoklu aday profili karşılaştırma desteği

## Faz 4 & Faz 5: Operasyonel Hazırlık, Cron Giriş Noktası ve Tarayıcı Doğrulaması (Tamamlandı)
- `GET /api/health`, `.env.example`, `scripts/setup-cloudflare.sh --generate-vapid` ve `/ayarlar` altyapı hazırlığı çipleri
- `custom-worker.mjs` + `src/modules/worker/scheduled.ts` ile Cloudflare Cron `scheduled()` -> `POST /api/cron/sync` bağlantısı
- `scripts/probe-sources.ts` (`npm run probe:sources`) ve `scripts/browser-audit.mjs` (Açık/Koyu + Masaüstü/Mobil `antislop` R-35 doğrulaması)

## Faz 6 & Faz 7: Maksimum Veri Kalitesi, 5 Dakikalık Senkronizasyon ve Premium UI (Tamamlandı)
- **Canlı Resmî Bağlayıcılar:** Kariyer Kapısı JSON API (`GetIseAlimPage`, `GetIlanPreviewPublic`, `GetAltIlanInfoByIlanIdPublic`), SBB Kamu İlan (`kamuilan.sbb.gov.tr`), İŞKUR Kamu Memur (`iskur.gov.tr/ilanlar/kamu-memur-alim-ilanlari/`) ve pozitif filtreli Resmî Gazete; çapraz kaynak tekilleştirme + 81 il/ilçe/üniversite il çıkarımı
- **İnce İşlenmiş D1 (`0004_phase7_enrichment.sql`):** `announcement_positions` alt kadro tablosu, `source_checkpoints`, `saved_searches` özel alarmları, monotonik veri kalitesi koruması, ihale/yönetmelik gürültüsü temizliği ve kadro bazlı Eşleştirme Motoru v2
- **Çift Katmanlı 5 Dakikalık Tazelik:** Cloudflare Cron `*/5 * * * *` (devre kesicili hızlı Worker turu) + GitHub Actions `sync-official-sources.yml` / `npm run sync:remote` (`POST /api/cron/ingest`) ile WAF engeli olmadan 179 alt kadronun D1'e aktarımı
- **Hallmark + Antislop Premium UI:** Canlı güncellik şeridi, iç kategori sekmeleri (`Memur A/B`, `Sözleşmeli 4/B`, `Akademik`, `Kamu İşçi`, `Askerî & Kolluk`), `Mülakatsız (KPSS)` hızlı filtresi, alt kadrolu slide-over çekmece ve tek tık arama alarmı

## Öncelik Sırası (Sonraki Fazlar)
1. **Faz 9 (Orta Öncelik - Ölçeklenebilirlik, Performans ve DevOps):** `9.703` KPSS kaydını D1/compact JSON'a ayırarak Worker paketini küçültme, OpenNext R2 önbellek katmanı, `/analiz` içine SBB kartı ekleme ve kaynak bazlı ayrıştırıcı alarm panosu
2. **Faz 10 (Düşük Öncelik - Büyüme, Mobil TWA & B2B):** `/nitelik/[kod]` ve `/kurum/[slug]` SEO sayfaları, PWA üzerine Android TWA Google Play yayını, danışmanlık/B2B çoklu aday modu
3. **Faz 8 (En Son - Demoda Tutulacak / Gelir Aktivasyonu):** `RESEND_API_KEY` + `STRIPE_*` / `iyzico` canlı ödeme ve e-posta anahtarları, Telegram Bot bildirimleri ve tam E2E auth+billing otomasyonu (kullanıcı kararına göre tüm ürün olgunlaşana dek demoda tutulur)
