# Lean Management System

Profesyonel şirketler için **yalın yönetim** ve **kalite yönetim sistemi** süreçlerini tek noktadan yöneten, çok şirketli (SaaS) web platformu. Mobil uygulama sonraki fazda aynı API üzerine kurulacak.

**Modüller:** Organizasyon ve personel · Merkezi aksiyon yönetimi · KPI takibi · Toplantı yönetimi · Stratejik planlama ve Hoshin Kanri · Problem çözme / DÖF (Balık kılçığı + 5 Neden) · 5S ve TPM denetimleri · Öneri sistemi ve Kaizen

| Doküman | İçerik |
|---|---|
| [docs/01-gereksinim-analizi-ve-plan.md](docs/01-gereksinim-analizi-ve-plan.md) | Gereksinimler, kararlar, faz planı |
| [docs/02-teknik-tasarim.md](docs/02-teknik-tasarim.md) | Mimari ve geliştirme kuralları |
| [docs/03-api-uc-noktalari.md](docs/03-api-uc-noktalari.md) | API uç noktaları |
| [docs/04-durum-raporu.md](docs/04-durum-raporu.md) | Güncel durum, bilinen eksikler, sonraki adımlar |

## Yapı

```
apps/api       NestJS + Prisma + PostgreSQL (REST /api/v1, Swagger /api/docs)
apps/web       Next.js + Tailwind + TanStack Query
packages/shared  Ortak tipler, yetki kodları, enum'lar
```

## Hızlı Başlangıç (kendi bilgisayarınızda)

Internet sağlayıcısı, alan adı veya hesap gerekmez; her şey kendi bilgisayarınızda (localhost) çalışır.

1. **Docker Desktop'ı kurun** ve açın: https://www.docker.com/products/docker-desktop/ (Windows, macOS, Linux). Kurulumdan sonra bilgisayarı yeniden başlatmanız istenebilir.
2. Bu klasörü (zip ise önce **"Tümünü ayıkla / Extract all"** ile) bir yere çıkarın.
3. **Windows:** `baslat.bat` dosyasına çift tıklayın. **macOS/Linux:** terminalde `sh baslat.sh`.
4. İlk çalıştırmada uygulama derlenir; bu **birkaç dakika** sürer (internet gerekir). Hazır olunca tarayıcı kendiliğinden **http://localhost:3000** adresini açar.

Doğrudan komutla: `docker compose up -d --build`

### Giriş bilgileri (demo)

| Kullanıcı | Şirket kodu | Kullanıcı adı | Şifre |
|---|---|---|---|
| Yönetici | `DEMO` | `admin` | `admin123` |
| Personel (ör. sicil 2001) | `DEMO` | `1001`, `2001`, `3001`, `4001` ... | `Demo1234!` |

### Durdurma, yeniden başlatma, sıfırlama

| İşlem | Windows | macOS/Linux |
|---|---|---|
| Durdur (veriler korunur) | `durdur.bat` | `sh durdur.sh` |
| Tekrar başlat | `baslat.bat` (bu sefer hızlı açılır) | `sh baslat.sh` |
| Tüm verileri sil, sıfırdan başla | `sifirla.bat` (onay ister) | `sh sifirla.sh` |

Verileriniz Docker "volume" içinde saklanır; durdursanız veya bilgisayarı kapatsanız da kaybolmaz.

### Sorun giderme

- **"Docker bulunamadı / çalışmıyor":** Docker Desktop'ı kurun ve açın; sol altta "Engine running" (yeşil) olana kadar bekleyin, sonra `baslat.bat` dosyasını tekrar çalıştırın.
- **Port kullanımda (3000, 4000 veya 5433):** Başka bir program o portu kullanıyor. Onu kapatın ya da kök klasörde `.env` adlı bir dosya oluşturup portları değiştirin, örn. `WEB_PORT=3100`, `API_PORT=4100`, `DB_PORT=5434`. Sonra adres `http://localhost:3100` olur (not: `baslat` betikleri tarayıcıyı 3000 portuna göre açar).
- **İlk açılış çok uzun sürüyor:** İlk derleme 5-10 dakika sürebilir; sonraki açılışlar birkaç saniyedir. Ne olduğunu görmek için `docker compose logs -f`.
- **Sayfa açılmıyor, "bağlantı reddedildi":** Uygulama henüz ayağa kalkmamış olabilir; 1-2 dakika bekleyip sayfayı yenileyin. `docker compose ps` ile üç servisin (db, api, web) "healthy/running" olduğunu kontrol edin.
- **Güncelleme sonrası eski görüntü:** `docker compose up -d --build` komutunu tekrar çalıştırın.

Ayrıntılar (Docker'sız geliştirici kurulumu dahil): [docs/06-yerel-kurulum.md](docs/06-yerel-kurulum.md).

### Geliştiriciler için (Docker'sız)

Gereksinimler: Node.js 22, pnpm 10, PostgreSQL 16.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm --filter @lean/shared build
pnpm --filter @lean/api exec prisma migrate deploy
pnpm --filter @lean/api seed
pnpm dev          # api :4000 (Swagger /api/docs), web :3000
```

Yalnız veritabanını Docker ile çalıştırmak için: `docker compose up -d db` (port 5433; `.env` içinde `DATABASE_URL=postgresql://lean:lean@localhost:5433/lean?schema=public`).

Alternatif: bulutta yayın için [docs/05-yayina-alma.md](docs/05-yayina-alma.md) (isteğe bağlı, Vercel).

## Testler

```bash
pnpm --filter @lean/api test        # birim testleri
pnpm --filter @lean/api test:e2e    # uçtan uca testler (lean_test veritabanı)
pnpm typecheck && pnpm lint
```
