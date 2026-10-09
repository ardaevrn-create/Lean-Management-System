# Yerel Kurulum (localhost)

Uygulama, hiçbir bulut sağlayıcısına veya alan adına bağlı olmadan kendi bilgisayarınızda çalışır.

## 1. Docker ile (önerilen, tek komut)

Gereksinim: Docker Desktop (Compose v2 dahil).

```bash
docker compose up -d --build
```

Veya `baslat.bat` (Windows) / `sh baslat.sh` (macOS, Linux): Docker'ın kurulu ve açık olduğunu denetler, uygulamayı başlatır, `http://localhost:3000/api/v1/health` yanıt verene kadar bekler ve tarayıcıyı açar.

| Servis | Açıklama | Host portu |
|---|---|---|
| `web` | Next.js (`apps/web/Dockerfile`). `/api/v1` isteklerini `API_ORIGIN=http://api:4000` adresine aktarır | 3000 (`WEB_PORT`) |
| `api` | NestJS (`apps/api/Dockerfile`). Açılışta `prisma migrate deploy`, `SEED_DEMO=true` ile demo verisi (yoksa), sonra `node dist/main.js`. Swagger: http://localhost:4000/api/docs | 4000 (`API_PORT`) |
| `db` | PostgreSQL 16, veritabanı `lean` (kullanıcı/şifre `lean`) | 5433 (`DB_PORT`) — yerel Postgres ile çakışmasın diye 5432 değil |

Kalıcı veri: `pgdata` (veritabanı) ve `uploads` (dosya ekleri, `STORAGE_DRIVER=disk`, `UPLOAD_DIR=/data/uploads`) adlı Docker volume'leri.

### Ayarlar (isteğe bağlı)
Kök klasörde `.env` dosyası oluşturarak değiştirilebilir: `WEB_PORT`, `API_PORT`, `DB_PORT`, `JWT_SECRET`. Not: `WEB_PORT` değişirse API'nin CORS adresi (`WEB_ORIGIN`) otomatik uyarlanır; web imajı aynı kalır. SMTP (e-posta) için `docker-compose.yml` içindeki `api.environment` altına `SMTP_URL` ve `MAIL_FROM` ekleyin.

### Sık komutlar
```bash
docker compose ps                  # durum
docker compose logs -f api         # günlükler (api / web / db)
docker compose stop                # durdur (veriler kalır)  → durdur.bat
docker compose down                # konteynerleri sil (veriler kalır)
docker compose down -v             # VERİLERİ DE SİL (sıfırla)  → sifirla.bat
docker compose up -d --build       # kod değiştiyse yeniden derle
```
Yeniden başlatmak güvenlidir: migration'lar idempotenttir, demo seed şirket zaten varsa atlanır.

### Yedekleme
```bash
docker compose exec db pg_dump -U lean lean > yedek.sql
docker compose exec -T db psql -U lean lean < yedek.sql     # geri yükleme (boş veritabanına)
```
Dosya ekleri için `uploads` volume'ünü ayrıca yedekleyin.

### Sorun giderme
- Docker çalışmıyor: Docker Desktop'ı açın.
- Port dolu: ilgili programı kapatın veya `.env` ile portu değiştirin (yukarıda).
- İlk derleme yavaş: ilk seferde bağımlılıklar indirilir (5-10 dk); sonraki derlemeler katman önbelleğini kullanır.
- Derleme sırasında ağ/sertifika hatası: kurumsal proxy/antivirüs HTTPS'i denetliyor olabilir; farklı bir ağdan deneyin.

## 2. Docker'sız (geliştirici)

Gereksinimler: Node.js 22, pnpm 10 (`corepack enable`), PostgreSQL 16.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # DATABASE_URL'i kendi Postgres'inize göre düzenleyin
pnpm --filter @lean/shared build
pnpm --filter @lean/api exec prisma migrate deploy
pnpm --filter @lean/api seed
pnpm dev                                    # api :4000, web :3000
```
Veritabanını Docker ile açmak isterseniz: `docker compose up -d db` ve `DATABASE_URL=postgresql://lean:lean@localhost:5433/lean?schema=public`.

Testler: `pnpm typecheck && pnpm --filter @lean/web lint`, `pnpm --filter @lean/api test`, `pnpm --filter @lean/api test:e2e` (`TEST_DATABASE_URL`, örn. `postgresql://lean:lean@localhost:5432/lean_test?schema=public`).

## 3. Mimari notu
Web imajı derlenirken `API_ORIGIN` verilir; böylece `next.config.ts` içindeki rewrite `/api/v1/*` isteklerini `api` konteynerine yönlendirir ve Vercel'e özgü gömülü API yolu (`src/pages/api/v1/[...path].ts`) imajda boş bir yer tutucuyla değiştirilir (depodaki dosya değişmez). Tarayıcı yalnız `http://localhost:3000` ile konuşur.
