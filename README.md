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

## Hızlı Başlangıç

Gereksinimler: Node.js 22, pnpm 10, PostgreSQL 16 (veya `docker compose up -d`).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm --filter @lean/shared build
pnpm --filter @lean/api exec prisma migrate deploy
pnpm --filter @lean/api seed
pnpm dev
```

Web: http://localhost:3000. Giriş bilgileri: şirket kodu `DEMO`, yönetici `admin` / `admin123`. Demo personel hesaplarında kullanıcı adı sicil numarasıdır (ör. `2001`), şifre `Demo1234!`.

## Testler

```bash
pnpm --filter @lean/api test        # birim testleri
pnpm --filter @lean/api test:e2e    # uçtan uca testler (lean_test veritabanı)
pnpm typecheck && pnpm lint
```
