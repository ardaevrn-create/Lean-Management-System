# Yayına Alma: Vercel

Sistem Vercel'de **iki proje** olarak çalışır (aynı GitHub deposundan):

| Vercel projesi | Root Directory | Görevi |
|---|---|---|
| `…-api` (yeni) | `apps/api` | NestJS API, Vercel fonksiyonu olarak. Veritabanı: Vercel Marketplace üzerinden Neon Postgres |
| mevcut web projesi | `apps/web` | Next.js arayüzü. `/api/v1/*` isteklerini API projesine aktarır (CORS gerekmez) |

Ayarlar depodaki `apps/api/vercel.json` ve `apps/web/vercel.json` dosyalarında; panelden yalnız **Root Directory** ve **ortam değişkenleri** girilir.

## 0. Kodu `main` dalına alın
Pull request'i birleştirin. Vercel `main` dalından kurar.

## 1. API projesi
1. Vercel → **Add New → Project** → aynı depoyu seçin → **Root Directory: `apps/api`** → proje adı ör. `vrnlean-api`.
2. İlk kurulumdan önce veritabanını bağlayın: proje → **Storage → Create Database → Neon (Postgres)** → projeye bağlayın. Bu işlem `DATABASE_URL` ve `DATABASE_URL_UNPOOLED` değişkenlerini otomatik ekler.
3. **Settings → Environment Variables**:

| Değişken | Değer |
|---|---|
| `JWT_SECRET` | uzun rastgele bir metin |
| `CRON_SECRET` | uzun rastgele bir metin (Vercel Cron bunu otomatik kullanır) |
| `STORAGE_DRIVER` | `db` (dosya ekleri veritabanında saklanır) |
| `SCHEDULER_ENABLED` | `false` (hatırlatmaları Vercel Cron tetikler) |
| `SEED_DEMO` | `true` (DEMO şirketini yükler; varsa atlanır) |

4. **Deploy**. Derleme sırasında veritabanı tabloları kurulur ve demo verisi yüklenir.
5. Kontrol: `https://<api-projesi>.vercel.app/api/v1/health` → `{"status":"ok"}`

## 2. Web projesi (mevcut proje)
1. **Settings → Build and Deployment → Root Directory: `apps/web`**.
2. **Settings → Environment Variables**:

| Değişken | Değer |
|---|---|
| `API_ORIGIN` | API projesinin adresi, ör. `https://vrnlean-api.vercel.app` |
| `NEXT_PUBLIC_API_URL` | `/api/v1` |

3. **Deployments → son kurulum → ⋯ → Redeploy** (değişkenler derleme sırasında okunur).

## Giriş
Şirket kodu `DEMO`, `admin` / `Admin123!`; personel kullanıcı adı sicil no (1001…4001), şifre `Demo1234!`.

## Vercel'e özgü notlar
- **Hatırlatmalar:** `apps/api/vercel.json` içindeki cron her gün 04:00 UTC'de (07:00 İstanbul) `/api/v1/internal/cron/daily` uç noktasını çağırır. Hobby planda günde bir cron yeterlidir.
- **Dosya ekleri:** Vercel istek gövdesi 4,5 MB ile sınırlıdır; daha büyük dosyalar yüklenemez. Üretimde Vercel Blob/S3 önerilir.
- **İlk istek:** Fonksiyon bir süre çağrılmazsa ilk istek birkaç saniye sürebilir (soğuk başlangıç).
- Demo şifreleri herkesçe bilinir; gerçek veri girmeden önce değiştirin.

## Alternatif: Docker / Railway
`apps/api/Dockerfile` ve kökteki `railway.json` ile API sürekli çalışan bir sunucuda da çalıştırılabilir (`STORAGE_DRIVER=disk`, uygulama içi zamanlayıcı açık).
