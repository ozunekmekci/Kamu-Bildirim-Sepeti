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
- PWA Service Worker üzerinden tarayıcı anlık bildirimleri (Web Push)
- Kurum, şehir ve nitelik kodu bazlı geçmiş alım yoğunluğu ve taban puan eğilim panoları
- Dinamik il/kurum/nitelik kodu iniş sayfaları ve otomatik sitemap genişletmesi
- Kurumsal / danışmanlık hesapları için çoklu aday profili karşılaştırma desteği
