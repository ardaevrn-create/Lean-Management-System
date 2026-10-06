/** Hazır (yerleşik) denetim şablonları. Şirketler oluşturduktan sonra kendi ihtiyaçlarına göre uyarlayabilir. */
import type { AuditAreaType, AuditBuiltinTemplateInfo, AuditScaleType, AuditTemplateType } from '@lean/shared';

export interface BuiltinQuestion { text: string; guidance?: string; weight?: number; photoRequiredBelow?: number }
export interface BuiltinSection { title: string; weight?: number; questions: BuiltinQuestion[] }
export interface BuiltinTemplate {
  key: string; name: string; description: string; type: AuditTemplateType; areaType: AuditAreaType; scaleType: AuditScaleType;
  sections: BuiltinSection[];
}

const SCALE_GUIDE_5S = '0 = hiç uygulanmıyor, 1 = zayıf, 2 = orta, 3 = iyi, 4 = örnek uygulama.';

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    key: '5S_PRODUCTION',
    name: '5S Denetimi — Üretim Alanı',
    description: 'Üretim hatları ve atölyeler için 5S (Ayıkla, Düzenle, Temizle, Standartlaştır, Sürdür) denetim listesi. Skala 0–4.',
    type: 'FIVE_S', areaType: 'PRODUCTION', scaleType: 'ZERO_TO_FOUR',
    sections: [
      {
        title: '1S — Ayıkla (Seiri)',
        questions: [
          { text: 'Çalışma alanında gereksiz malzeme, ekipman veya hurda bulunmuyor.', guidance: `Hat kenarı, tezgah altı ve geçiş yollarına bakın. ${SCALE_GUIDE_5S}`, photoRequiredBelow: 2 },
          { text: 'Kırmızı etiket alanı tanımlı ve içindeki malzemeler için karar/termin belirlenmiş.', guidance: 'Kırmızı etiketli malzemelerde etiket tarihi ve sorumlu yazılı olmalı.' },
          { text: 'Tezgah ve makine üzerinde yalnızca o işte kullanılan alet ve dokümanlar var.' },
          { text: 'Kullanılmayan alet, sarf malzeme ve eski dokümanlar düzenli olarak ayıklanıyor.', guidance: 'Son ayıklama kaydı/tarihi sorulabilir.' },
          { text: 'Kişisel eşyalar (yiyecek, içecek, giysi) için ayrılmış yerler kullanılıyor.' },
        ],
      },
      {
        title: '2S — Düzenle (Seiton)',
        questions: [
          { text: 'Tüm alet, aparat ve malzemelerin yeri işaretli (gölge pano, zemin işareti, etiket).', photoRequiredBelow: 2 },
          { text: 'Alet ve malzemeler kullanım sıklığına göre erişilebilir yerde, kullanıldıktan sonra yerine konuyor.' },
          { text: 'Yürüyüş yolları, forklift yolları ve acil çıkışlar işaretli ve engelsiz.', weight: 2, guidance: 'İş güvenliği açısından kritik; yol üzerinde engel varsa puanı düşürün.', photoRequiredBelow: 2 },
          { text: 'Proses içi stok (WIP) ve sevk bekleyen ürünler tanımlı alanlarda, etiketli ve FIFO uygun.' },
          { text: 'Kablo, hortum ve hava hatları düzenli, sabitlenmiş ve yerde sürünmüyor.' },
        ],
      },
      {
        title: '3S — Temizle (Seiso)',
        questions: [
          { text: 'Zemin temiz; yağ, sıvı, talaş veya toz birikintisi yok.', weight: 2, photoRequiredBelow: 2 },
          { text: 'Makine ve ekipmanlar temiz; kirlilik kaynakları (sızıntı, talaş sıçraması) tespit edilmiş.' },
          { text: 'Temizlik malzemeleri (süpürge, bez, emici) belirlenen yerde ve eksiksiz.' },
          { text: 'Atıklar türüne göre ayrıştırılmış; atık kutuları dolu değil ve etiketli.' },
          { text: 'Aydınlatma, kapı ve pencereler temiz ve çalışır durumda.' },
        ],
      },
      {
        title: '4S — Standartlaştır (Seiketsu)',
        questions: [
          { text: '5S standartları, temizlik/kontrol planları ve sorumluluk panosu alanda görünür durumda.' },
          { text: 'Renk kodları, etiketleme ve işaretleme kuralları alan genelinde tutarlı uygulanıyor.' },
          { text: 'Temizlik ve kontrol çizelgeleri düzenli dolduruluyor ve imzalı.', photoRequiredBelow: 2 },
          { text: 'Önceki denetim bulguları için başlatılan aksiyonlar takip ediliyor.' },
          { text: 'Standartlar ve görsel yönetim araçları çalışanlar tarafından biliniyor (rastgele iki çalışana sorun).' },
        ],
      },
      {
        title: '5S — Sürdür (Shitsuke)',
        questions: [
          { text: 'Çalışanlar 5S kurallarına kendiliğinden uyuyor; hatırlatma gerektirmiyor.' },
          { text: 'Vardiya başı/sonu 5S rutini (5 dakika) uygulanıyor.' },
          { text: '5S eğitimi alan çalışan oranı yeterli; yeni başlayanlara oryantasyonda anlatılıyor.' },
          { text: 'Alan sorumlusu 5S sonuçlarını periyodik olarak gözden geçiriyor ve panoda paylaşıyor.' },
          { text: 'İyileştirme önerileri ve kaizenler teşvik ediliyor; örnekler görünür.' },
        ],
      },
    ],
  },
  {
    key: '5S_OFFICE',
    name: '5S Denetimi — Ofis',
    description: 'Ofis ve idari alanlar için 5S denetim listesi. Skala 0–4.',
    type: 'FIVE_S', areaType: 'OFFICE', scaleType: 'ZERO_TO_FOUR',
    sections: [
      {
        title: '1S — Ayıkla',
        questions: [
          { text: 'Masa üzerinde yalnızca o anki işle ilgili doküman ve malzemeler bulunuyor.', guidance: SCALE_GUIDE_5S, photoRequiredBelow: 2 },
          { text: 'Dolap ve çekmecelerde süresi geçmiş, gereksiz veya mükerrer dokümanlar yok.' },
          { text: 'Kullanılmayan ofis malzemeleri ve elektronik atıklar ayıklanmış.' },
          { text: 'Ortak alanlarda (toplantı odası, mutfak, fotokopi alanı) sahipsiz eşya yok.' },
        ],
      },
      {
        title: '2S — Düzenle',
        questions: [
          { text: 'Dosya ve klasörler etiketli; arşiv düzeni (kod, yıl, saklama süresi) belli.', photoRequiredBelow: 2 },
          { text: 'Ortak kullanılan ekipman ve malzemelerin yeri belli ve etiketli.' },
          { text: 'Kablolar toplanmış, geçiş yollarında takılma riski yok.', weight: 2 },
          { text: 'Dijital dosyalar ortak klasör yapısına ve isimlendirme kuralına uygun.' },
        ],
      },
      {
        title: '3S — Temizle',
        questions: [
          { text: 'Masa, ekran, klavye ve ortak yüzeyler temiz.' },
          { text: 'Zemin, pencere kenarları ve dolap üstleri toz ve kirden arınmış.' },
          { text: 'Mutfak ve ortak alanlar kullanım sonrası temizleniyor; buzdolabı düzenli kontrol ediliyor.' },
          { text: 'Atık kutuları (kağıt, plastik, genel) ayrıştırılmış ve taşmıyor.' },
        ],
      },
      {
        title: '4S — Standartlaştır',
        questions: [
          { text: 'Ofis 5S kuralları ve sorumluluk çizelgesi görünür bir yerde asılı.' },
          { text: 'Temiz masa politikası ve çalışma sonu rutini tanımlı ve biliniyor.' },
          { text: 'Ortak alan temizlik/kontrol çizelgeleri düzenli dolduruluyor.', photoRequiredBelow: 2 },
          { text: 'Acil durum çıkışları, yangın söndürücüler ve ilk yardım dolabı işaretli ve erişilebilir.', weight: 2 },
        ],
      },
      {
        title: '5S — Sürdür',
        questions: [
          { text: 'Çalışanlar 5S kurallarına hatırlatma olmadan uyuyor.' },
          { text: 'Düzenli (haftalık/aylık) ayıklama ve arşiv temizliği yapılıyor.' },
          { text: 'Yeni çalışanlara ofis 5S kuralları anlatılıyor.' },
          { text: 'Önceki denetim bulguları kapatılmış veya takip altında.' },
        ],
      },
    ],
  },
  {
    key: '5S_WAREHOUSE',
    name: '5S Denetimi — Depo',
    description: 'Hammadde, yarı mamul ve mamul depoları için 5S denetim listesi. Skala 0–4.',
    type: 'FIVE_S', areaType: 'WAREHOUSE', scaleType: 'ZERO_TO_FOUR',
    sections: [
      {
        title: '1S — Ayıkla',
        questions: [
          { text: 'Hareketsiz, hurda veya kullanım süresi dolmuş malzemeler ayrı bir alanda tanımlanmış.', guidance: SCALE_GUIDE_5S, photoRequiredBelow: 2 },
          { text: 'Boş palet, ambalaj ve dolgu malzemeleri tanımlı alanlarda; koridorlarda bırakılmamış.' },
          { text: 'Stok sayım farkı olan veya sahibi belirsiz malzeme bulunmuyor.' },
          { text: 'Kırmızı etiket uygulaması işletiliyor ve karar tarihleri takip ediliyor.' },
        ],
      },
      {
        title: '2S — Düzenle',
        questions: [
          { text: 'Raf ve lokasyon etiketleri (koridor/raf/göz) okunaklı ve sistemle uyumlu.', photoRequiredBelow: 2 },
          { text: 'Malzemeler FIFO/FEFO kuralına uygun yerleştirilmiş.' },
          { text: 'Ağır yükler alt raflarda; raf yük sınırı işaretli ve aşılmamış.', weight: 2, photoRequiredBelow: 2 },
          { text: 'Forklift ve yaya yolları işaretli, koridorlar engelsiz.', weight: 2 },
          { text: 'Tehlikeli madde ve kimyasallar ayrı, etiketli ve uygun şekilde depolanmış.', weight: 2 },
        ],
      },
      {
        title: '3S — Temizle',
        questions: [
          { text: 'Zemin ve koridorlar temiz; sıvı sızıntısı veya döküntü yok.' },
          { text: 'Raf ve paletlerde toz, kırık ambalaj veya zarar görmüş ürün yok.' },
          { text: 'Zararlı (kemirgen, böcek) kontrol noktaları temiz ve kayıtlı.' },
          { text: 'Atık ve ambalaj atıkları düzenli uzaklaştırılıyor.' },
        ],
      },
      {
        title: '4S — Standartlaştır',
        questions: [
          { text: 'Depo yerleşim planı, yükleme/boşaltma kuralları ve 5S standartları görünür.' },
          { text: 'Sayım ve temizlik çizelgeleri düzenli dolduruluyor.', photoRequiredBelow: 2 },
          { text: 'Forklift günlük kontrol formları dolduruluyor ve imzalı.' },
          { text: 'Yangın söndürücü, acil çıkış ve ilk yardım ekipmanları işaretli ve kontrol tarihleri geçerli.', weight: 2 },
        ],
      },
      {
        title: '5S — Sürdür',
        questions: [
          { text: 'Depo personeli 5S ve güvenlik kurallarına kendiliğinden uyuyor.' },
          { text: 'Vardiya sonu düzen/temizlik rutini uygulanıyor.' },
          { text: 'Periyodik 5S değerlendirmesi yapılıyor, sonuçlar paylaşılıyor.' },
          { text: 'Önceki denetim bulguları için aksiyonlar zamanında kapatılıyor.' },
        ],
      },
    ],
  },
  {
    key: 'TPM_AM_STEP1_3',
    name: 'TPM Otonom Bakım — Adım 1–3',
    description: 'Otonom bakım (Jishu Hozen) ilk üç adımı: ilk temizlik, kirlilik kaynaklarının önlenmesi, temizlik ve yağlama standartları. Skala 0–4.',
    type: 'TPM_AUTONOMOUS', areaType: 'PRODUCTION', scaleType: 'ZERO_TO_FOUR',
    sections: [
      {
        title: 'Adım 1 — İlk Temizlik',
        questions: [
          { text: 'Makine ve çevresi baştan sona temizlenmiş; gizli kalan bölgeler (kapak içleri, tabla altı) dahil.', guidance: SCALE_GUIDE_5S, photoRequiredBelow: 2 },
          { text: 'Temizlik sırasında bulunan anormallikler (gevşek bağlantı, çatlak, sızıntı, aşınma) etiketle işaretlenmiş.', weight: 2 },
          { text: 'Bulunan anormalliklerin kayıtları (anormallik listesi / etiket sayısı) güncel tutuluyor.' },
          { text: 'Operatörler makineyi "kontrol ederek temizleme" yaklaşımını açıklayabiliyor.' },
          { text: 'Kırmızı/mavi etiketlerin kapatılma durumu takip ediliyor; açık etiketlerin termini belli.', photoRequiredBelow: 2 },
        ],
      },
      {
        title: 'Adım 2 — Kirlilik Kaynaklarının ve Ulaşılması Zor Yerlerin Önlenmesi',
        questions: [
          { text: 'Kirlilik kaynakları (sızıntı, talaş, toz, yağ sıçraması) listelenmiş ve önceliklendirilmiş.' },
          { text: 'Kaynakta önleme için iyileştirmeler yapılmış (koruyucu kapak, sızdırmazlık, toplayıcı vb.).', photoRequiredBelow: 2 },
          { text: 'Temizlik, yağlama ve kontrol süresini kısaltan iyileştirmeler (kolay erişim, açılır kapak) uygulanmış.' },
          { text: 'İyileştirmelerin öncesi/sonrası kaydı tutulmuş (kaizen / tek nokta dersi).' },
          { text: 'Aynı kirlilik kaynağı tekrar ortaya çıkmıyor; temizlik süresi azalmış.' },
        ],
      },
      {
        title: 'Adım 3 — Temizlik ve Yağlama Standartları',
        questions: [
          { text: 'Makine bazlı temizlik, yağlama ve kontrol standartları yazılı; yapılacak iş, yöntem, süre ve sıklık belli.', weight: 2 },
          { text: 'Yağlama noktaları ve yağ türleri makine üzerinde işaretli; yağ seviye göstergeleri görünür.', photoRequiredBelow: 2 },
          { text: 'Standartlar görsel olarak makinede veya yakınında asılı ve güncel.' },
          { text: 'Standartlar vardiya içinde uygulanıyor; çizelgeler eksiksiz dolduruluyor.', photoRequiredBelow: 2 },
          { text: 'Operatörler standardı uygulama ve anormallik bildirme konusunda eğitilmiş; eğitim kayıtları mevcut.' },
        ],
      },
    ],
  },
  {
    key: 'EQUIPMENT_DAILY',
    name: 'Makine Günlük Kontrol Listesi',
    description: 'Operatör tarafından vardiya başında yapılan günlük makine kontrolü. Cevaplar Evet / Hayır.',
    type: 'TPM_EQUIPMENT', areaType: 'PRODUCTION', scaleType: 'YES_NO',
    sections: [
      {
        title: 'Emniyet',
        weight: 2,
        questions: [
          { text: 'Acil stop butonları çalışıyor ve erişilebilir.', weight: 2, photoRequiredBelow: 1 },
          { text: 'Koruyucu kapak, bariyer ve ışık perdesi yerinde ve çalışıyor.', weight: 2, photoRequiredBelow: 1 },
          { text: 'Uyarı etiketleri ve işaretler okunaklı ve eksiksiz.' },
          { text: 'Makine çevresinde kayma/takılma riski oluşturan engel veya sızıntı yok.' },
        ],
      },
      {
        title: 'Temizlik ve Görsel Kontrol',
        questions: [
          { text: 'Makine ve çalışma alanı temiz; talaş, toz ve yağ birikimi yok.' },
          { text: 'Görünür çatlak, deformasyon veya hasar yok.', photoRequiredBelow: 1 },
          { text: 'Yağ, hava veya soğutma sıvısı kaçağı yok.', weight: 2, photoRequiredBelow: 1 },
          { text: 'Anormal koku, duman veya ısınma yok.' },
        ],
      },
      {
        title: 'Yağlama ve Bağlantılar',
        questions: [
          { text: 'Yağ ve soğutma sıvısı seviyeleri uygun aralıkta.' },
          { text: 'Yağlama noktaları standarda göre yağlanmış.' },
          { text: 'Cıvata, somun ve bağlantı elemanlarında gevşeklik yok.', photoRequiredBelow: 1 },
          { text: 'Kayış, zincir ve hortumlarda aşınma veya gerginlik sorunu yok.' },
        ],
      },
      {
        title: 'Çalışma Kontrolü',
        questions: [
          { text: 'Makine boşta çalıştırıldığında anormal ses veya titreşim yok.' },
          { text: 'Hava basıncı, sıcaklık ve diğer göstergeler normal aralıkta.' },
          { text: 'Sensörler ve kalite kontrol düzenekleri (poka-yoke) test edildi ve çalışıyor.', weight: 2 },
          { text: 'Takım/kalıp/aparat durumu uygun; aşınmış parça yok.' },
          { text: 'Önceki vardiyadan devreden bir arıza veya not yok (varsa etiket açıldı).' },
        ],
      },
    ],
  },
];

export const builtinInfo = (t: BuiltinTemplate): AuditBuiltinTemplateInfo => ({
  key: t.key, name: t.name, description: t.description, type: t.type, areaType: t.areaType, scaleType: t.scaleType,
  sectionCount: t.sections.length, questionCount: t.sections.reduce((n, s) => n + s.questions.length, 0),
});
