# Yalın Yönetim & Kalite Yönetim Platformu — Gereksinim Analizi ve Proje Planı

> Durum: **v1.0 — Onaylandı** (müşteri cevaplarına göre güncellendi, bkz. §0). Teknik tasarım: `02-teknik-tasarim.md`.
> Hedef: Önce web tabanlı uygulama, ardından mobil entegrasyon.

---

## 0. Alınan Kararlar (v1.0)

| # | Konu | Karar |
|---|------|-------|
| K1 | Kullanım modeli | **Çok şirketli SaaS ürün** (multi-tenant). Her şirketin verisi izole. |
| K2 | Barındırma | **Bulut**. |
| K3 | Kullanıcı sayısı | Sınır yok. **Saha çalışanlarına da hesap açılır**; öneri verir, kendi aksiyonlarını takip eder. E-postası olmayan kullanıcı için giriş: *şirket kodu + kullanıcı adı/sicil no + şifre*. |
| K4 | Problem çözme | **Balık kılçığı (Ishikawa) ve 5 Neden zorunlu** adımlar. 8D zorunlu değil (opsiyonel format, sonraki faz). |
| K5 | KPI verisi | Büyük oranda **elle giriş**; otomasyona açık mimari. **Excel sürükle-bırak içe aktarım**, Power BI / Excel / Power Automate ile **API üzerinden veri alışverişi**. |
| K6 | 5S / TPM / öneri formları | Standart şablonları biz tasarlarız; şirket kendi şablonunu uyarlayabilir. |
| K7 | Teknoloji ve faz sırası | Önerilen yığın ve faz sırası onaylandı. |

### 0.1 Kararlardan doğan yeni / değişen gereksinimler

| Kod | Gereksinim | Öncelik |
|-----|-----------|---------|
| I-01 | **Excel sürükle-bırak içe aktarma sihirbazı**: dosyayı bırak → önizleme → kolon eşleştirme → doğrulama (hatalı satırlar işaretli) → onayla. Personel, organizasyon, KPI tanımı, KPI değeri, aksiyon için. | Z |
| I-02 | Her içe aktarma için **hazır Excel şablonu indirme** | Z |
| I-03 | **API anahtarı** (şirket bazlı, yetki kapsamlı) ile dış sistemlerden veri yazma (ör. Power Automate, ERP script'i KPI değeri gönderir) | Ö |
| I-04 | **Power BI / Excel için okuma uç noktaları** (düz tablo formatında KPI, aksiyon, öneri, denetim verisi; API anahtarı ile "Web" bağlayıcısından çekilebilir) | Ö |
| I-05 | Tüm listelerde Excel dışa aktarım | Z |
| I-06 | Planlı içe aktarma (paylaşılan klasör / OneDrive Excel'inden periyodik veri çekme) | İ |
| M1-05 (güncel) | Her personel kullanıcı hesabına sahip olabilir; e-posta zorunlu değil. Toplu hesap açma, ilk girişte şifre değiştirme, yönetici tarafından şifre sıfırlama. | Z |
| M5-02 (güncel) | Problem çözme akışı: Tanım (5N1K) → Acil önlem → **Balık kılçığı (zorunlu)** → **5 Neden (zorunlu, en az bir kök nedene ulaşmalı)** → Düzeltici/önleyici aksiyonlar → Etkinlik doğrulama → Kapanış. 8D/A3 rapor görünümü opsiyonel. | Z |
| SaaS-01 | Şirket (tenant) kaydı, şirket kodu, abonelik/lisans durumu, platform yönetim paneli | Z |
| SaaS-02 | Şirket bazlı marka ayarları (logo, renk) | Ö |

---

## 1. Vizyon ve Kapsam

Profesyonel şirketlerin **yalın yönetim** (Lean) yöntemlerini ve **kalite yönetim sistemi** (ISO 9001 vb.) gerekliliklerini **tek bir platformdan** yönetmesini sağlayan, çok kullanıcılı, web tabanlı (ileride mobil destekli) bir uygulama.

### 1.1 Talep metninden çıkarılan ana modüller

| # | Modül | Talepteki karşılığı |
|---|-------|---------------------|
| M1 | Organizasyon & Personel Yönetimi | "personel ve şirket organizasyonu yönetimi" |
| M2 | Stratejik Planlama | "Stratejik planlama süreci" |
| M3 | Hoshin Kanri – Hedef Dağıtımı | "Hoshin Kanri mantığı ile hedef dağıtımı ve gerçekleşme verilerinin yönetimi" |
| M4 | Toplantı Yönetimi | "toplantı kayıtları ve toplantı aksiyonlarının dağıtımı ve gerçekleşme takibi" |
| M5 | Düzeltici Faaliyet / Problem Çözme | "düzeltici faaliyet problem çözme süreci ve aksiyonlarının takibi" |
| M6 | 5S – TPM Denetimleri | "5S-TPM denetimlerinin yönetiminin sağlanması" |
| M7 | Öneri Sistemi & Kaizen | "öneri sistemi ve kaizen süreçlerinin yönetimi" |
| M8 | KPI Yönetimi | "KPI takibi, eksik veri girişlerinin raporlanması ve görünür kılınması, hedef altı KPI'lar için açıklama ve aksiyon girişi" |

### 1.2 Talepte açıkça yazmayan ama zorunlu çıkan ortak bileşenler

Talepteki modüllerin hemen hepsi "**aksiyon dağıtımı ve takibi**" içeriyor (toplantı, düzeltici faaliyet, denetim bulgusu, KPI sapması, Hoshin, kaizen). Bu nedenle mimarinin kalbi olarak şunlar önerilir:

| # | Ortak Bileşen | Neden gerekli |
|---|---------------|---------------|
| C1 | **Merkezi Aksiyon Yönetimi** | Tüm modüllerden doğan aksiyonlar tek havuzda; kişi "Aksiyonlarım" ekranında hepsini görür. Tekrarlanan geliştirmeyi önler. |
| C2 | Kimlik Doğrulama & Yetkilendirme (RBAC) | Rol ve organizasyon birimine göre veri görünürlüğü. |
| C3 | Bildirim & Hatırlatma & Eskalasyon | Geciken aksiyon, eksik KPI verisi, yaklaşan denetim vb. |
| C4 | İş Akışı / Onay Motoru | Öneri değerlendirme, DÖF kapatma, KPI açıklama onayı. |
| C5 | Dosya / Fotoğraf Ekleri | Denetim kanıtları, kaizen önce/sonra fotoğrafları, toplantı dokümanları. |
| C6 | Denetim İzi (Audit Log) | Kalite sistemi gereği "kim, ne zaman, neyi değiştirdi" kaydı. |
| C7 | Dashboard & Raporlama | Yönetim panosu, modül bazlı raporlar, Excel/PDF çıktı. |
| C8 | Parametre / Şablon Yönetimi | Denetim soru listeleri, toplantı tipleri, KPI tanımları, kök neden kategorileri. |
| C9 | Çoklu Dil (TR / EN) | Profesyonel şirketler, yabancı ortaklı yapılar. |

---

## 2. Fonksiyonel Gereksinimler (Modül Bazında)

Öncelik: **Z** = Zorunlu (MVP), **Ö** = Önemli (sonraki faz), **İ** = İsteğe bağlı / ileride

### M1 — Organizasyon & Personel Yönetimi

| Kod | Gereksinim | Öncelik |
|-----|-----------|---------|
| M1-01 | Hiyerarşik organizasyon yapısı: Şirket → Lokasyon/Fabrika → Direktörlük → Departman → Birim/Hat/Alan (seviye sayısı esnek) | Z |
| M1-02 | Organizasyon şeması (org chart) görselleştirmesi | Ö |
| M1-03 | Personel kartı: sicil no, ad-soyad, unvan/pozisyon, birim, yönetici, e-posta, telefon, işe giriş, durum (aktif/pasif) | Z |
| M1-04 | Pozisyon tanımları ve raporlama ilişkisi (kime bağlı) | Z |
| M1-05 | Kullanıcı hesabı ↔ personel eşleşmesi (her personel kullanıcı olmak zorunda değil; ör. saha çalışanı öneri verebilir) | Z |
| M1-06 | Takımlar / komiteler (ör. Kaizen komitesi, 5S ekibi, Hoshin ekibi) — birimlerden bağımsız çapraz gruplar | Z |
| M1-07 | Excel ile toplu personel ve organizasyon içe aktarma | Z |
| M1-08 | Vekalet tanımı (izindeki yöneticinin onaylarının devri) | Ö |
| M1-09 | HR / Active Directory / ERP entegrasyonu ile otomatik senkron | İ |
| M1-10 | Yetkinlik matrisi (skill matrix) | İ |

### M2 — Stratejik Planlama

| Kod | Gereksinim | Öncelik |
|-----|-----------|---------|
| M2-01 | Strateji dönemi tanımı (ör. 2026–2030) | Z |
| M2-02 | Vizyon, misyon, değerler kaydı | Z |
| M2-03 | Durum analizi araçları: SWOT, (opsiyonel PESTLE, paydaş analizi) | Ö |
| M2-04 | Uzun vadeli **atılım hedefleri** (3–5 yıl) ve stratejik amaçlar | Z |
| M2-05 | Stratejik amaçların perspektiflere bağlanması (BSC: Finans, Müşteri, Süreç, Öğrenme-Gelişim) — opsiyonel sınıflandırma | Ö |
| M2-06 | Strateji dokümanı versiyonlama ve onay | Ö |
| M2-07 | Stratejik plan sunum/rapor çıktısı (PDF) | Ö |

### M3 — Hoshin Kanri (Hedef Dağıtımı)

| Kod | Gereksinim | Öncelik |
|-----|-----------|---------|
| M3-01 | Hoshin seviyeleri: Atılım hedefi (3-5 yıl) → Yıllık hedef → Öncelikli iyileştirme projeleri/öncelikler → Departman hedefi → (opsiyonel) Bireysel hedef | Z |
| M3-02 | Her hedef için: sahibi, birim, ölçüm KPI'ı, başlangıç değeri, hedef değer, dönem, ağırlık | Z |
| M3-03 | Üst hedef ↔ alt hedef **ağaç bağlantısı** ve izlenebilirlik ("bu departman hedefi hangi stratejik amaca hizmet ediyor?") | Z |
| M3-04 | **X-Matrix** görünümü (yıllık hedefler, öncelikler, metrikler, sorumlular arası korelasyon) | Ö |
| M3-05 | **Catchball** süreci: üst seviye hedef önerir → alt seviye yorum/karşı öneri → mutabakat ve onay kaydı | Ö |
| M3-06 | **Bowling Chart**: aylık plan vs gerçekleşme, kırmızı/yeşil gösterim | Z |
| M3-07 | Gerçekleşme verilerinin hedefe bağlı KPI'lardan otomatik çekilmesi (M8 entegrasyonu) | Z |
| M3-08 | Hedef altı gerçekleşmede açıklama + karşı önlem (countermeasure) + aksiyon (C1 entegrasyonu) | Z |
| M3-09 | Hedef ilerleme özeti: şirket → departman drill-down | Z |
| M3-10 | Dönem sonu değerlendirme / yıllık Hoshin gözden geçirme raporu | Ö |
| M3-11 | Öncelikli projeler için A3 proje planı | İ |

### M4 — Toplantı Yönetimi

| Kod | Gereksinim | Öncelik |
|-----|-----------|---------|
| M4-01 | Toplantı tipi tanımları (ör. Günlük Kademe/Tier 1-2-3, Haftalık Departman, Aylık Yönetim Gözden Geçirme, YGG – ISO 9001 9.3) ve standart gündem şablonları | Z |
| M4-02 | Periyodik toplantı planı (tekrarlayan toplantılar) | Z |
| M4-03 | Toplantı kaydı: tarih/saat, yer/online, organizatör, katılımcılar, **katılım durumu** | Z |
| M4-04 | Gündem maddeleri, görüşülen konular, alınan **kararlar** | Z |
| M4-05 | Toplantı içinden **aksiyon oluşturma**: sorumlu, termin, öncelik → otomatik bildirim (C1) | Z |
| M4-06 | Önceki toplantının açık aksiyonlarının yeni toplantıda otomatik listelenmesi ("geçen toplantıdan açık kalanlar") | Z |
| M4-07 | Toplantı tutanağı PDF çıktısı ve katılımcılara e-posta ile dağıtım | Z |
| M4-08 | Toplantıda ilgili KPI panosunun / Hoshin durumunun gösterilmesi (ör. Tier toplantısında hattın KPI'ları) | Ö |
| M4-09 | Toplantı etkinlik metrikleri: katılım oranı, zamanında kapanan aksiyon oranı | Ö |
| M4-10 | Takvim entegrasyonu (Outlook / Google Calendar, .ics) | İ |

### M5 — Düzeltici Faaliyet / Problem Çözme (DÖF)

| Kod | Gereksinim | Öncelik |
|-----|-----------|---------|
| M5-01 | Problem/uygunsuzluk kaydı: kaynak (müşteri şikayeti, iç denetim, proses, tedarikçi, KPI sapması, 5S/TPM bulgusu, toplantı), tarih, alan, tanım, şiddet/öncelik, ekler | Z |
| M5-02 | Çoklu metodoloji desteği: **8D**, **A3**, basit DÖF (ISO 9001 10.2); şirket hangisini kullanacağını seçer | Z (8D + basit DÖF), Ö (A3) |
| M5-03 | Ekip oluşturma (D1), problem tanımı 5N1K / Is–Is Not (D2) | Z |
| M5-04 | Acil önlem / containment (D3) | Z |
| M5-05 | Kök neden analizi araçları: **5 Neden**, **Balık kılçığı (Ishikawa)** — yapılandırılmış form olarak | Z |
| M5-06 | Düzeltici ve önleyici faaliyetler → aksiyon olarak C1'e | Z |
| M5-07 | **Etkinlik doğrulama** (belirli süre sonra kontrol, tekrar etti mi?) ve kapatma onayı | Z |
| M5-08 | Yatay yaygınlaştırma (benzer süreç/hatlara uygulama) | Ö |
| M5-09 | Kök neden kategorisi istatistikleri, Pareto analizi | Ö |
| M5-10 | DÖF süreleri (açılıştan kapanışa), geciken DÖF raporu | Z |
| M5-11 | Müşteri formatında 8D raporu PDF çıktısı | Ö |

### M6 — 5S & TPM Denetimleri

| Kod | Gereksinim | Öncelik |
|-----|-----------|---------|
| M6-01 | Denetim şablonları: 5S (Ayıkla, Düzenle, Temizle, Standartlaştır, Sürdür) soru listesi, puanlama skalası (ör. 0–4 / 0–5), ağırlıklar; ofis / üretim / depo için farklı şablonlar | Z |
| M6-02 | TPM denetim şablonları: Otonom Bakım adımları (1–7), makine bazlı kontrol listeleri | Z |
| M6-03 | Denetim alanları (organizasyon yapısına bağlı: hat, makine, ofis) ve sorumluları | Z |
| M6-04 | **Denetim planı / takvimi**: periyodik (aylık vb.), denetçi rotasyonu, çapraz denetim | Z |
| M6-05 | Denetim icrası: soru bazında puan, açıklama, **fotoğraf** — sahada tablet/telefon ile (mobil-uyumlu, offline ihtiyacı değerlendirilecek) | Z |
| M6-06 | Bulgu → aksiyon dönüşümü (C1), istenirse DÖF açma (M5) | Z |
| M6-07 | Alan skor trendi, alanlar arası kıyas, 5S radar (örümcek) grafiği | Z |
| M6-08 | Yapılmayan / geciken denetim raporu | Z |
| M6-09 | TPM **anormallik kartları / etiketleri** (kırmızı-beyaz etiket) yönetimi: açılış, sınıflandırma, kapatma | Ö |
| M6-10 | Makine / ekipman envanteri (TPM için) | Ö |
| M6-11 | OEE, MTBF, MTTR verilerinin KPI olarak izlenmesi (M8 ile) | İ |
| M6-12 | Alan bazlı en iyi / en kötü sıralama ve ödüllendirme panosu | İ |

### M7 — Öneri Sistemi & Kaizen

| Kod | Gereksinim | Öncelik |
|-----|-----------|---------|
| M7-01 | Öneri girişi: mevcut durum, önerilen durum, beklenen fayda, kategori (kalite, İSG, maliyet, verimlilik, çevre...), ekler. **Kullanıcı hesabı olmayan saha çalışanı için de giriş yolu** (kiosk/QR/şef adına giriş) | Z |
| M7-02 | Değerlendirme akışı: ilk yönetici ön değerlendirme → komite değerlendirmesi → kabul/ret (gerekçeli) → uygulama → kapanış | Z |
| M7-03 | Değerlendirme kriterleri ve puanlama matrisi (şirkete göre parametrik) | Z |
| M7-04 | Kaizen türleri: Hızlı Kaizen (Before/After), Kaizen Etkinliği (Kaizen Event/Blitz), Kaizen Projesi | Z |
| M7-05 | Kaizen formu: problem, önce/sonra fotoğraf, yapılan iyileştirme, **somut ve soyut kazanç** (TL/yıl, süre, alan vb.) | Z |
| M7-06 | Kazanç doğrulama (finans onayı) | Ö |
| M7-07 | **Ödül / puan sistemi**: puan biriktirme, ödül kademeleri, ayın önerisi | Ö |
| M7-08 | Öneri istatistikleri: kişi başı öneri sayısı, kabul oranı, uygulama oranı, ortalama değerlendirme süresi, birim bazlı katılım | Z |
| M7-09 | Kaizen kütüphanesi / yaygınlaştırma (iyi uygulamaların aranabilir arşivi) | Ö |
| M7-10 | Öneri → Kaizen → (gerekirse) Hoshin öncelikli proje bağlantısı | İ |

### M8 — KPI Yönetimi

| Kod | Gereksinim | Öncelik |
|-----|-----------|---------|
| M8-01 | KPI tanımı: ad, kod, açıklama, birim, **formül** (opsiyonel, diğer KPI'lardan hesaplanan), **yön** (yüksek iyi / düşük iyi / aralık), **periyot** (günlük, haftalık, aylık, çeyreklik, yıllık), sahibi, veri giriş sorumlusu, ait olduğu birim | Z |
| M8-02 | KPI kütüphanesi ve şablonlar (aynı KPI'ı birden çok birime kopyalayabilme) | Z |
| M8-03 | Dönemsel **hedef** tanımı; isteğe bağlı eşikler (kırmızı / sarı / yeşil) | Z |
| M8-04 | Veri girişi: dönem bazlı ızgara ekranı, Excel ile toplu yükleme, açıklama alanı | Z |
| M8-05 | **Veri giriş takvimi**: her periyot için son giriş tarihi (ör. ayın 5'i) | Z |
| M8-06 | **Eksik veri raporu ve panosu**: kim, hangi KPI, hangi dönem girmedi; birim bazlı veri giriş uyum oranı; gecikme gün sayısı | Z |
| M8-07 | Eksik veri için otomatik hatırlatma ve eskalasyon (sorumlu → yöneticisi → üst yönetim) | Z |
| M8-08 | **Hedef altı KPI'lar** için zorunlu **sapma açıklaması** (neden) + **karşı önlem / aksiyon** girişi; girilmeden dönem "tamamlandı" sayılmaz | Z |
| M8-09 | Sapma açıklamasının yönetici tarafından onaylanması / reddedilmesi | Ö |
| M8-10 | Ardışık N dönem hedef altı → otomatik DÖF / problem çözme tetikleme önerisi (M5) | Ö |
| M8-11 | KPI kartı: trend grafiği, hedef çizgisi, kümülatif/YTD, önceki yıl kıyası | Z |
| M8-12 | KPI ağacı / KPI'ların Hoshin hedeflerine bağlanması (M3) | Z |
| M8-13 | Birim KPI panoları (dijital görsel yönetim panosu, toplantı ekranı modu) | Z |
| M8-14 | Gecikmiş veri girişinde düzeltme (revizyon) kaydı ve değişiklik geçmişi | Z |
| M8-15 | Dış sistemlerden otomatik veri (ERP, MES, SQL, API) | İ |

### C1 — Merkezi Aksiyon Yönetimi (tüm modüllerin ortak motoru)

| Kod | Gereksinim | Öncelik |
|-----|-----------|---------|
| C1-01 | Aksiyon: başlık, açıklama, **kaynak** (Toplantı / DÖF / Denetim / KPI sapması / Hoshin / Kaizen / Serbest), kaynak kayda link, sorumlu, destek kişiler, başlangıç, termin, öncelik, durum | Z |
| C1-02 | Durum yaşam döngüsü: Açık → Devam ediyor → Tamamlandı (kanıt) → Doğrulandı / Kapandı; İptal; **Gecikmiş** (otomatik) | Z |
| C1-03 | Termin revizyonu talebi ve onayı (revizyon geçmişi tutulur) | Z |
| C1-04 | İlerleme yüzdesi, yorumlar, ek dosya | Z |
| C1-05 | "**Aksiyonlarım**", "Ekibimin aksiyonları", "Benim açtıklarım" görünümleri; Kanban ve liste | Z |
| C1-06 | Hatırlatma (termin yaklaşırken), gecikme bildirimi, yöneticiye eskalasyon | Z |
| C1-07 | Aksiyon performans raporları: zamanında kapanma oranı, kişi/birim/kaynak bazında gecikme | Z |

### C7 — Dashboard & Raporlama

- Yönetici ana panosu: Hoshin hedef durumu, kırmızı KPI'lar, eksik veri uyumu, geciken aksiyonlar, açık DÖF'ler, 5S skorları, öneri katılımı (Z)
- Kişisel ana sayfa: bana atanmış aksiyonlar, girmem gereken KPI verileri, yaklaşan denetim/toplantılar, onay bekleyen işler (Z)
- Tüm listelerde filtre + Excel dışa aktarım (Z), PDF raporlar (Ö), zamanlanmış e-posta raporları (Ö)

---

## 3. Kullanıcı Rolleri ve Yetkilendirme

| Rol | Tipik yetkiler |
|-----|---------------|
| Sistem Yöneticisi (platform) | Şirket (tenant) oluşturma, lisans, sistem ayarları |
| Şirket Yöneticisi (Admin) | Organizasyon, kullanıcı, rol, şablon, parametre yönetimi |
| Üst Yönetim | Tüm şirket verisini görüntüleme, strateji/Hoshin onayı |
| Birim Yöneticisi | Kendi birimi ve alt birimlerinin verisi; onaylar; aksiyon atama |
| KPI Sahibi / Veri Giriş Sorumlusu | Kendi KPI'larına veri, açıklama ve aksiyon girişi |
| Kalite / Yalın Koordinatörü | DÖF, denetim, öneri süreçlerinin yönetimi; şirket geneli raporlar |
| Denetçi | Atandığı denetimleri yapma |
| Komite Üyesi | Öneri/kaizen değerlendirme |
| Çalışan | Öneri verme, kendisine atanan aksiyonlar, katıldığı toplantılar |

Yetki modeli: **Rol (ne yapabilir) + Kapsam (hangi organizasyon birimlerinde)**. Ör. "Birim Yöneticisi – Üretim Direktörlüğü ve alt birimleri".

---

## 4. Fonksiyonel Olmayan Gereksinimler

| Alan | Gereksinim |
|------|-----------|
| Mimari | **API-first**: Web ve ileride mobil aynı REST/GraphQL API'yi kullanır |
| Çoklu şirket | **Multi-tenant** (her şirketin verisi izole). Tek şirket kullanacaksa bile bu yapı baştan kurulmalı (sonradan eklemek pahalı) |
| Responsive / PWA | Web arayüzü tablet ve telefonda kullanılabilir olmalı; denetim ve öneri girişi sahada yapılacak. PWA ile mobil uygulama öncesi saha ihtiyacı karşılanabilir |
| Güvenlik | Şifre politikası, 2FA (Ö), SSO – Azure AD / Google (Ö), rol bazlı erişim, OWASP Top 10 |
| KVKK | Kişisel veri envanteri, aydınlatma metni, veri saklama/silme politikası, erişim logları |
| Denetim izi | Kritik kayıtlarda değişiklik geçmişi (kalite sistemi kayıt gereklilikleri) |
| Performans | Liste ekranları < 2 sn; 1.000+ eşzamanlı kullanıcıya ölçeklenebilir |
| Erişilebilirlik | Temel WCAG 2.1 AA |
| Dil / Yerelleştirme | TR (varsayılan), EN; tarih/sayı formatı yerelleştirme; saat dilimi |
| Yedekleme | Günlük otomatik yedek, geri yükleme prosedürü |
| Kurulum | Bulut (SaaS) ve gerekirse müşteri sunucusuna (on-prem) kurulabilir — Docker tabanlı |
| İzlenebilirlik | Uygulama logları, hata takibi, sağlık kontrolü |

---

## 5. Modüller Arası İlişki (Yüksek Seviye Veri Modeli)

```
Tenant (Şirket)
 ├── OrgUnit (hiyerarşik)  ── Employee ── User ── Role/Scope
 ├── StrategyPeriod ── StrategicObjective
 │        └── HoshinGoal (ağaç: parent_id) ──┐
 │                                           ├── KPI ── KpiTarget (dönem)
 │                                           │        └── KpiValue (dönem, değer)
 │                                           │              └── Deviation (açıklama) ──┐
 ├── MeetingType ── Meeting ── Agenda/Decision ──────────────────────────────────────┤
 ├── Problem/NC (DÖF / 8D / A3) ── RootCause (5 Why, Ishikawa) ─────────────────────┤
 ├── AuditTemplate ── AuditPlan ── Audit ── AuditAnswer ── Finding ─────────────────┤
 ├── Suggestion ── Evaluation ── Kaizen ── Gain ────────────────────────────────────┤
 │                                                                                   ▼
 └── ACTION (merkezi: source_type + source_id, owner, due_date, status, history)
         + Notification, Attachment, Comment, AuditLog (tüm varlıklar için ortak)
```

Temel tasarım kararları:
- **Aksiyon polimorfik kaynaklı tek tablo** — tüm modüller aynı aksiyon motorunu kullanır.
- **Ek, yorum, değişiklik geçmişi** her varlığa takılabilen ortak servisler.
- **Organizasyon birimi** neredeyse her kayıtta referans; raporlama ve yetki buna dayanır.
- **Dönem (period)** kavramı KPI, Hoshin ve denetim planında ortak kullanılır.

---

## 6. Önerilen Teknoloji Yığını (onaya tabi)

| Katman | Öneri | Gerekçe |
|--------|------|---------|
| Frontend (Web) | **Next.js (React) + TypeScript**, Tailwind CSS + shadcn/ui, TanStack Query, Recharts/ECharts | Yaygın, güçlü ekosistem; React bilgisi mobil tarafa taşınır |
| Backend | **NestJS (Node.js + TypeScript)** | Modüler yapı (modüllerimizle birebir örtüşür), RBAC/guard yapısı, OpenAPI üretimi; frontend ile ortak tip paylaşımı |
| Veritabanı | **PostgreSQL** + Prisma ORM | İlişkisel veri, hiyerarşik sorgular (recursive CTE), JSONB ile esnek şablon alanları, Row-Level Security ile tenant izolasyonu |
| Arka plan işleri | Redis + BullMQ | Hatırlatma, eskalasyon, eksik veri taraması, zamanlanmış raporlar |
| Dosya depolama | S3 uyumlu (AWS S3 / MinIO on-prem) | Fotoğraf ve doküman ekleri |
| Kimlik | JWT + refresh token; ileride OIDC (Azure AD, Google) | Web + mobil aynı kimlik altyapısı |
| Mobil (Faz 2) | **React Native (Expo)** | Kod ve tip paylaşımı, kamera/offline/push bildirim |
| Altyapı | Docker, docker-compose (geliştirme), CI/CD GitHub Actions | Bulut veya on-prem dağıtım |
| Test | Vitest/Jest (birim), Playwright (uçtan uca) | |
| Repo yapısı | Monorepo (pnpm workspaces / Turborepo): `apps/web`, `apps/api`, `apps/mobile`, `packages/shared` | Ortak tipler ve doğrulama şemaları (Zod) tek yerde |

Alternatif: Ekibinizde .NET / Java uzmanlığı varsa backend ASP.NET Core veya Spring Boot ile kurulabilir; mimari aynı kalır.

---

## 7. Fazlandırma / Yol Haritası

Her faz sonunda çalışan, kullanılabilir bir ürün çıkması hedeflenir.

### Faz 0 — Temel Altyapı (≈ 2–3 hafta)
- Monorepo, CI, Docker geliştirme ortamı
- Kimlik doğrulama, kullanıcı, rol/kapsam yetkilendirme, tenant yapısı
- Uygulama iskeleti: menü, layout, TR/EN dil altyapısı, tema
- Ortak servisler: ek dosya, yorum, audit log, bildirim (uygulama içi + e-posta)

### Faz 1 — MVP: "Ölç ve Takip Et" (≈ 6–8 hafta)
- **M1** Organizasyon & personel (+ Excel içe aktarma)
- **C1** Merkezi aksiyon yönetimi
- **M8** KPI: tanım, hedef, veri girişi, eksik veri panosu, hatırlatma, hedef altı açıklama + aksiyon
- **M4** Toplantı yönetimi ve aksiyon dağıtımı
- Kişisel ana sayfa ve temel yönetici panosu

> Gerekçe: KPI + Toplantı + Aksiyon üçlüsü günlük yönetim sisteminin (Daily Management) çekirdeğidir; en hızlı değer üreten kısımdır ve diğer tüm modüller bunlara bağlanır.

### Faz 2 — "Strateji ve Problem Çözme" (≈ 6–8 hafta)
- **M2** Stratejik planlama
- **M3** Hoshin Kanri: hedef ağacı, bowling chart, KPI bağlantısı, (X-Matrix, catchball)
- **M5** Düzeltici faaliyet: basit DÖF + 8D, 5 Neden, Ishikawa, etkinlik doğrulama

### Faz 3 — "Saha ve Katılım" (≈ 6–8 hafta)
- **M6** 5S & TPM denetimleri (şablon, plan, saha icrası, fotoğraf, skor trendleri, TPM etiketleri)
- **M7** Öneri sistemi & Kaizen (iş akışı, değerlendirme, kazanç, ödül/puan)
- PWA (ana ekrana ekleme, kamera erişimi)

### Faz 4 — Mobil Uygulama (≈ 6–8 hafta)
- React Native uygulaması: Aksiyonlarım, KPI veri girişi, denetim icrası (offline), öneri girişi, push bildirim, onaylar
- Mevcut API'nin doğrudan kullanımı

### Faz 5 — Gelişmiş Özellikler
- SSO, ERP/MES entegrasyonları, otomatik KPI veri çekme
- Gelişmiş raporlama / BI, zamanlanmış raporlar
- A3, yatay yaygınlaştırma, yetkinlik matrisi, OEE

*(Süreler 1–2 geliştiricilik bir ekip için kaba tahmindir; netleşen kapsama göre güncellenecektir.)*

---

## 8. Kabul Kriterlerine Örnek (MVP)

- Bir birim yöneticisi kendi birimine bir KPI tanımlayıp aylık hedef girebilmeli.
- Veri giriş son tarihi geçen KPI'lar, eksik veri panosunda sorumlu ve gecikme günüyle kırmızı görünmeli; sorumluya otomatik e-posta gitmeli.
- Hedef altında kalan bir değer girildiğinde sistem açıklama ve en az bir karşı önlem/aksiyon girilmeden dönemi kapatmamalı.
- Toplantıda oluşturulan aksiyon, sorumlunun "Aksiyonlarım" listesine düşmeli; bir sonraki aynı tip toplantıda açık aksiyon olarak listelenmeli.
- Termini geçen aksiyon otomatik "Gecikmiş" olmalı ve sorumlunun yöneticisine bildirim gitmeli.

---

## 9. Netleştirilmesi Gereken Sorular (cevaplandı — bkz. §0)

1. **Kullanım modeli**: Tek bir şirket (kendi şirketiniz) mi kullanacak, yoksa birden çok şirkete satılacak bir **SaaS ürün** mü?
2. **Barındırma**: Bulut (SaaS) mu, müşteri sunucusu (on-prem) mu, ikisi de mi?
3. **Ölçek**: Şirket başına yaklaşık kullanıcı sayısı? Hesabı olmayan saha çalışanları da sisteme dahil olacak mı (öneri verme vb.)?
4. **Dil**: Yalnızca Türkçe yeterli mi, İngilizce de baştan gerekli mi?
5. **Problem çözme metodolojisi**: 8D, A3, basit DÖF — hangileri öncelikli? Müşteri (ör. otomotiv) formatına uygun 8D raporu gerekli mi?
6. **5S / TPM**: Mevcut denetim formlarınız ve puanlama skalanız var mı? Sahada internet olmayan alanlar var mı (offline gereksinimi)?
7. **Öneri sistemi**: Ödül / puan sistemi uygulanıyor mu? Değerlendirme kademeleri nasıl (yönetici → komite)?
8. **KPI verisi**: Tamamen manuel giriş mi, yoksa ERP/MES/Excel kaynaklarından otomatik veri gerekiyor mu? KPI'lar formülle birbirinden hesaplanıyor mu?
9. **Entegrasyonlar**: E-posta (SMTP/Office 365), Active Directory/SSO, ERP (SAP, Logo, Netsis...) ihtiyacı?
10. **Mevcut veri**: Excel'de tutulan mevcut KPI, aksiyon, öneri verileri içe aktarılacak mı?
11. **Teknoloji tercihi**: Önerilen yığın (Next.js + NestJS + PostgreSQL + React Native) uygun mu, ekibinizin tercih ettiği bir dil/çatı var mı?
12. **Öncelik**: Önerilen faz sırası (KPI + Toplantı + Aksiyon önce) iş ihtiyacınıza uyuyor mu?
13. **Tasarım**: Kurumsal kimlik (logo, renk) ve örnek almak istediğiniz bir arayüz var mı?

---

## 10. Sonraki Adımlar

1. Bu dokümanın gözden geçirilmesi ve §9'daki soruların cevaplanması
2. Kapsam ve fazların kesinleştirilmesi (v1.0)
3. Detaylı veri modeli (ERD) ve API taslağı
4. Ana ekranların wireframe'leri (ana sayfa, KPI giriş, eksik veri panosu, toplantı, aksiyon)
5. Faz 0 geliştirmesine başlangıç
