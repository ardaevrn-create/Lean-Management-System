# Yayına Alma: Vercel (tek proje)

Web arayüzü ve API **aynı Vercel projesinde** çalışır. NestJS API'si `apps/web/src/pages/api/v1/[...path].ts` yolu üzerinden Next.js içinde çalışır; ayrıca bir API projesi veya `API_ORIGIN` gerekmez. Ayarlar `apps/web/vercel.json` ve `scripts/vercel-build.sh` dosyalarındadır.

## Kurulum (bir kez)

1. Kodun `main` dalında olduğundan emin olun (pull request birleştirilmiş olmalı) veya projenin **Production Branch** ayarını kod dalına çevirin.
2. Proje → **Settings → Build and Deployment → Root Directory: `apps/web`**.
3. Proje → **Storage → Create Database → Neon (Postgres)** → bu projeye bağlayın. `DATABASE_URL` ve `DATABASE_URL_UNPOOLED` otomatik eklenir.
4. Proje → **Settings → Environment Variables**:

| Değişken | Değer |
|---|---|
| `JWT_SECRET` | uzun rastgele bir metin |
| `CRON_SECRET` | uzun rastgele bir metin (Vercel Cron bunu otomatik kullanır) |
| `STORAGE_DRIVER` | `db` |
| `SCHEDULER_ENABLED` | `false` |
| `SEED_DEMO` | `true` (DEMO şirketini yükler; varsa yönetici şifresini sıfırlar) |

`API_ORIGIN` ve `NEXT_PUBLIC_API_URL` **tanımlamayın** (tanımlıysa silin).

5. **Deployments → son kurulum → ⋯ → Redeploy**. Derleme sırasında veritabanı tabloları kurulur ve demo verisi yüklenir.

## Kontrol

- `https://<proje>.vercel.app/api/v1/health` → `{"status":"ok"}`
- Giriş: şirket `DEMO`, `admin` / `admin123`; personel kullanıcı adı sicil no (1001…4001), şifre `Demo1234!`.

## Sorun giderme

| Belirti | Neden / çözüm |
|---|---|
| Derleme logunda `DATABASE_URL tanımlı değil` | Neon veritabanını projeye bağlayın (adım 3) |
| Girişte "Network Error" | Eski kurulum çalışıyor; Redeploy yapın. `API_ORIGIN` tanımlıysa silin |
| `/api/v1/health` 500 hatası | Proje → **Logs**; genellikle `DATABASE_URL` veya `JWT_SECRET` eksiktir |

## Notlar

- **Hatırlatmalar:** Vercel Cron her gün 04:00 UTC'de (07:00 İstanbul) `/api/v1/internal/cron/daily` uç noktasını çağırır.
- **Dosya ekleri:** veritabanında saklanır; Vercel istek gövdesi 4,5 MB ile sınırlıdır.
- **Soğuk başlangıç:** uzun süre kullanılmayınca ilk istek birkaç saniye sürebilir.
- Demo şifreleri herkesçe bilinir; gerçek veri girmeden önce değiştirin.

## Alternatifler

- **Ayrı API projesi:** `apps/api` kökünden ikinci bir Vercel projesi (`apps/api/vercel.json`); web projesinde `API_ORIGIN` = API adresi.
- **Docker / Railway:** `apps/api/Dockerfile` + kökteki `railway.json`; web projesinde `API_ORIGIN` = API adresi.
