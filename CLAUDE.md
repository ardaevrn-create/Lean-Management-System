# CLAUDE.md

Çok şirketli (SaaS) yalın yönetim + kalite yönetim sistemi platformu. Kullanıcıyla Türkçe konuşulur; UI metinleri TR (birincil) + EN.

## Önce oku
- `docs/01-gereksinim-analizi-ve-plan.md` — gereksinimler ve **§0 alınmış kararlar** (K1–K7)
- `docs/02-teknik-tasarim.md` — bağlayıcı mimari ve kod kuralları (§8 DB, §10 modül kalıbı)
- `docs/03-api-uc-noktalari.md` — tüm API uç noktaları
- `docs/04-durum-raporu.md` — ne bitti, bilinen eksikler, sonraki işler

## Yapı
- `apps/api` NestJS + Prisma 6 + PostgreSQL. Çekirdek `src/core/*`, iş modülleri `src/modules/{kpi,meetings,problems,strategy,audits,suggestions}`.
- `apps/web` Next.js 16 (App Router, istemci tarafı veri çekme, TanStack Query, Tailwind v4).
- `packages/shared` ortak tipler/yetki kodları/saf iş kuralları (`@lean/shared`; değişince `pnpm --filter @lean/shared build`).
- Prisma şeması çok dosyalı: `apps/api/prisma/schema/*.prisma`, migration'lar `prisma/schema/migrations/`.

## Temel kurallar
- Tenant izolasyonu: servislerde `prisma.db` (tenant filtreli) kullan; `prisma.raw` yalnız auth/platform/zamanlanmış işler. Create'lerde unchecked input + `tenantId: this.ctx.tenantId`.
- Aksiyonlar her modülde `ActionsService.create({ sourceType, sourceId, sourceLabel })` ile açılır; modül kendi aksiyon tablosunu yapmaz.
- Yetki: `@RequirePermissions(...)` + `AccessService` (rol + birim kapsamı). İzin kodları `packages/shared/src/permissions.ts`.
- Web metinleri: modül çevirileri `apps/web/src/messages/modules/<modül>.{tr,en}.json`, `lib/i18n.tsx` içinde `<modül>Module` anahtarıyla bağlanır. Kodda sabit Türkçe metin yazma.
- Her değişiklikte denetim izi: `AuditService.log(...)`.

## Yayın (Vercel)
- İki Vercel projesi: `apps/api` (NestJS, `api/index.js` fonksiyonu + `src/serverless.ts`, Neon Postgres) ve `apps/web` (Next.js, `/api/v1` → `API_ORIGIN` rewrite). Rehber: `docs/05-yayina-alma.md`.
- Prisma Rust'sız istemci (`engineType = "client"` + `@prisma/adapter-pg`); WASM dosyası `src/serverless.ts` içindeki ipucu ile pakete girer, silmeyin.
- Vercel'de `STORAGE_DRIVER=db`, `SCHEDULER_ENABLED=false`; hatırlatmalar Vercel Cron → `/api/v1/internal/cron/daily`.

## Komutlar
```bash
docker compose up -d                                  # postgres
pnpm install && pnpm --filter @lean/shared build
pnpm --filter @lean/api exec prisma migrate deploy
pnpm --filter @lean/api seed                          # DEMO şirketi (zaten varsa atlanır)
pnpm dev                                              # api :4000 (Swagger /api/docs), web :3000
pnpm typecheck && pnpm --filter @lean/web lint
pnpm --filter @lean/api test                          # birim
pnpm --filter @lean/api test:e2e                      # uçtan uca; lean_test veritabanı gerekir (TEST_DATABASE_URL)
```
Demo girişi: şirket `DEMO`, `admin` / `Admin123!`; personel kullanıcı adı = sicil no (1001…4001), şifre `Demo1234!`.

## Kalınan yer (06.10.2026)
Faz 0–3 tamam: 8 modülün hepsi çalışıyor, 107 birim + 84 e2e test geçiyor. Kullanıcıya sorulan ve **cevap bekleyen** kararlar:
1. Bulut sağlayıcı (AWS/Azure/GCP/Hetzner/TR veri merkezi — KVKK)
2. E-posta servisi (şirketin SMTP/O365'i mi, SendGrid/SES gibi ortak servis mi)
3. Sıradaki öncelik: (a) üretime hazırlık (önerilen) (b) mobil uygulama (Faz 4) (c) pilot geri bildirimi
Karardan bağımsız yapılabilecekler: giriş denemesi sınırlama, dosya eklerinde kayıt bazlı erişim kontrolü, platform yönetim ekranı.
