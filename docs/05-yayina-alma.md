# Yayına Alma: Vercel (web) + Railway (API + PostgreSQL)

Web arayüzü Vercel'de, sürekli çalışan API ve veritabanı Railway'de çalışır. Tarayıcı yalnız web adresine gider; Next.js `/api/v1/*` isteklerini Railway'deki API'ye aktarır (CORS ayarı gerekmez).

> Önemli: kod şu an `claude/lean-quality-management-app-tfve6t` dalında. Vercel ve Railway'de bu dalı seçin ya da dalı önce `main`'e birleştirin. `main` boş olduğu için oradan yapılan kurulum çalışmaz.

## 1. Railway: veritabanı + API

1. railway.com → **New Project → Deploy from GitHub repo** → `lean-management-system`.
2. Servisin **Settings → Source** bölümünde dalı `claude/lean-quality-management-app-tfve6t` yapın. Kökteki `railway.json` sayesinde `apps/api/Dockerfile` kullanılır; ayrıca ayar gerekmez.
3. Aynı projeye **+ New → Database → PostgreSQL** ekleyin.
4. API servisinin **Variables** bölümüne:

| Değişken | Değer |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (Railway referansı) |
| `JWT_SECRET` | uzun rastgele bir metin |
| `SEED_DEMO` | `true` (DEMO şirketini yükler; zaten varsa atlanır) |
| `WEB_ORIGIN` | Vercel adresiniz, ör. `https://lean-xxx.vercel.app` |

5. **Settings → Networking → Generate Domain** ile genel adres alın (ör. `https://lean-api-production.up.railway.app`). `https://<adres>/api/v1/health` açıldığında `{"status":"ok"}` görmelisiniz.

## 2. Vercel: web arayüzü

1. vercel.com → **Add New → Project** → aynı depo.
2. **Root Directory**: `apps/web` (Framework: Next.js otomatik gelir; kurulum/derleme komutları `apps/web/vercel.json` içinde).
3. **Production Branch**: `claude/lean-quality-management-app-tfve6t` (Settings → Git) — veya dalı `main`'e birleştirin.
4. **Environment Variables**:

| Değişken | Değer |
|---|---|
| `API_ORIGIN` | Railway API adresi, ör. `https://lean-api-production.up.railway.app` |
| `NEXT_PUBLIC_API_URL` | `/api/v1` |

5. Deploy. Değişkenleri sonradan değiştirirseniz **Redeploy** gerekir (derleme sırasında okunurlar).

## Giriş

Şirket kodu `DEMO`, `admin` / `Admin123!`; personel kullanıcı adı sicil no (1001…4001), şifre `Demo1234!`.

## Demo kurulumunun sınırları

- Yüklenen dosyalar Railway konteynerinin diskinde durur; yeniden dağıtımda silinir. Kalıcılık için Railway **Volume** bağlayıp `UPLOAD_DIR` değişkenini o yola verin (ör. `/data/uploads`) ya da S3 depolamaya geçin.
- E-posta gönderimi yok (bildirimler uygulama içinde).
- Demo şifreleri herkesçe bilinir; gerçek müşteri verisi girmeden önce değiştirin.
