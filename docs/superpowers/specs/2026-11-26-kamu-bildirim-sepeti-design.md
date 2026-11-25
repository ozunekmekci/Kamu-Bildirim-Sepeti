# Kamu Bildirim Sepeti — Faz 1 SaaS Mimari ve Ürün Tasarım Dokümanı

**Tarih:** 2026-11-26  
**Marka:** Kamu Bildirim Sepeti (yalnızca bu marka adı kullanılır; hiçbir harici referans uygulama adı kullanılmaz)  
**Hedef Platform:** Next.js 16 (App Router) + Tailwind v4 + OpenNext Cloudflare Workers + Cloudflare D1 & Cron (PWA destekli)

---

## 1. Ürün Amacı ve Kapsam
Kamu Bildirim Sepeti, kamu kurumları tarafından yayımlanan **atama**, **personel alımı** ve **görevlendirme** ilanlarını tek noktadan takip etmeyi sağlayan bir SaaS platformudur.

### Temel Özellikler (Faz 1)
1. **İlan Listesi ve Arama:** Açık (`acik`), kapalı (`kapali`) ve profilinize uygun (`Bana Uygun`) ilan akışı; kurum, unvan, şehir, kaynak ve kategori bazlı arama. İlan detayında başvuru şartları ve kriter özeti.
2. **Resmî Bilgi Kaynakları:**
   - Kariyer Kapısı Kamu İşe Alım Platformu: `https://kariyerkapisi.gov.tr`
   - Türkiye İş Kurumu (İŞKUR): `https://www.iskur.gov.tr/`
   - T.C. Resmî Gazete: `https://www.resmigazete.gov.tr/`
   - ÖSYM KPSS Arşivi (`/kpss-arsivi` altında mevcut 9.703 yerleştirme kadrosu korunur)
   - **Bağlayıcılık Uyarısı:** Her ilanın güncel, eksiksiz ve bağlayıcı hâli ilgili kamu kurumunun resmî internet sitesinde yayımlanan metindir. Kamu Bildirim Sepeti üzerinde gösterilen bilgiler ile resmî kaynak arasında farklılık bulunması hâlinde resmî kaynak esas alınmalıdır.
3. **Profil Tabanlı Eşleşme (`matching`):** Eğitim düzeyi, akademik bölüm/nitelik kodu, KPSS puan türü (P3/P93/P94) ve puanı, ikamet ili, askerlik durumu, ehliyet sınıfları ve sertifikalara göre uygunluk değerlendirmesi.
4. **Kayıtlı İlanlar ve Bildirim Tercihleri (`tracking`):** İlan kaydetme/çıkarma, yeni ilan bildirimi, son başvuru yaklaşan ilanlar için gün bazlı hatırlatıcı ve e-posta bildirim ayarları (e-posta gönderimi Faz 1'de `EmailAdapter` seam'i arkasında).
5. **Açık ve Koyu Tema:** WCAG AA kontrastlı, gradyansız ve parıltısız, hem açık hem koyu modda eksiksiz çalışan kurumsal ürün arayüzü.
6. **SaaS Planları (`billing`):**
   - **Ücretsiz Plan:** Güncel ilan akışı (ilk 15 ilan), en fazla 10 kayıtlı ilan, ilan şart özeti, tam KPSS arşivi.
   - **Premium Plan:** Sınırsız ilan görüntüleme, "Bana Uygun" profil eşleşme sekmesi, sınırsız kayıtlı ilan, anlık yeni ilan ve son başvuru hatırlatıcıları. (Faz 1'de `PaymentAdapter` seam'i ile demo plan geçişi; Faz 2'de canlı ödeme bağlanır.)
7. **Güven, KVKK ve Hesap Yönetimi (`identity`):**
   - Kayıt sırasında Kullanım Koşulları ve Gizlilik Politikası onayı.
   - Toplanan veriler: Ad (İsteğe bağlı), E-posta adresi, Kullanıcı kimlikleri, Telefon numarası (İsteğe bağlı) ve Profil bilgileri. Üçüncü taraflarla veri paylaşımı **yoktur**. Veriler aktarım sırasında şifrelenir.
   - Self-servis hesap ve tüm ilişkili verilerin kalıcı silinmesi (`DELETE /api/account`).

---

## 2. Modüler Mimari (`src/modules/`)
1. `src/modules/announcements/`: Tekil `Announcement` şeması, 3 resmî kaynak HTML parser'ı, başlangıç veri seti (24 gerçekçi ilan), filtreleme ve senkronizasyon servisi.
2. `src/modules/matching/`: Saf profil-ilan eşleştirme motoru (`evaluateAnnouncementMatch`, `matchAnnouncementsForProfile`), mevcut Türkçe normalizasyon (`@/lib/turkish`) ve nitelik sözlüğünü yeniden kullanır.
3. `src/modules/db/`: `DatabaseAdapter` seam'i (`D1Adapter` + test/yerel bellek için `MemoryDbAdapter`), `migrations/0001_init.sql` (D1 SQLite şeması, `ON DELETE CASCADE`).
4. `src/modules/identity/`: Web Crypto (`PBKDF2` + `HMAC-SHA256`) tabanlı edge uyumlu Auth, profil yönetimi ve KVKK hesap silme.
5. `src/modules/tracking/`: Kayıtlı ilanlar, bildirim tercihleri, yaklaşan son başvuru sorgusu ve `EmailAdapter` seam'i.
6. `src/modules/billing/`: Plan yetkilendirme (`EntitlementGate`) ve `PaymentAdapter` seam'i (`DemoPaymentAdapter`).

---

## 3. API Yüzeyi (`src/app/api/`)
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET|PUT /api/profile`, `DELETE /api/account`
- `GET /api/announcements`, `GET /api/announcements/[id]`, `GET /api/announcements/matched`
- `GET|POST|DELETE /api/saved`, `GET|PUT /api/notifications/preferences`
- `GET /api/billing`, `POST /api/billing/plan`, `POST /api/cron/sync`

---

## 4. Sayfalar ve Rotalar (`src/app/`)
- `/`: Ürün odaklı ana ilan akışı (Açık / Kapalı / Bana Uygun, arama ve filtreler, hızlı şart özeti çekmecesi, tek net CTA)
- `/ilan/[id]`: İlan detayı, şart özeti, profil uygunluk dökümü ve resmî kaynak bağlantısı
- `/kayitli`: Kayıtlı ilanlar
- `/profil`: Aday profil formu
- `/ayarlar`: Bildirim tercihleri ve KVKK hesap/veri silme
- `/premium`: Ücretsiz ve Premium karşılaştırması ve Faz 1 demo geçişi
- `/giris` & `/kayit`: Oturum açma ve yasal onaylı kayıt
- `/kpss-arsivi`: Mevcut 9.703 KPSS merkezi yerleştirme kadrosu arama ve analiz aracı
- `/gizlilik-politikasi` & `/kullanim-kosullari`: KVKK veri envanteri ve 3 resmî kaynak beyanı

---

## 5. Doğrulama Kriterleri
- Yasaklı referans isim taraması: 0 eşleşme
- Em-dash (`—`) kontrolü (yeni/güncellenen UI metinlerinde): 0 eşleşme
- `npm test`: Mevcut 227+ test ve tüm yeni SaaS testleri %100 geçer
- `npm run lint`: 0 hata
- `npm run build` ve `npx opennextjs-cloudflare build`: Hatasız tamamlanır
