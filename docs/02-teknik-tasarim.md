# Teknik Tasarım ve Geliştirme Kuralları

> Bu doküman tüm geliştiriciler (ve yapay zeka alt ajanları) için **bağlayıcı** mimari ve kod kurallarıdır.
> Gereksinimler: `01-gereksinim-analizi-ve-plan.md`

## 1. Genel Mimari

```
                 ┌──────────────┐     ┌──────────────┐     ┌────────────────────┐
                 │  apps/web    │     │ apps/mobile  │     │ Power BI / Excel / │
                 │  Next.js     │     │ (Faz 4, RN)  │     │ Power Automate     │
                 └──────┬───────┘     └──────┬───────┘     └─────────┬──────────┘
                        │  JWT (Bearer)       │                       │ API Key
                        └──────────┬──────────┴───────────────────────┘
                                   ▼
                        ┌──────────────────────┐
                        │  apps/api  (NestJS)  │  REST /api/v1, OpenAPI /api/docs
                        │  modüler monolit     │
                        └───┬──────────┬───────┘
                            ▼          ▼
                     PostgreSQL     Dosya depolama (S3 uyumlu; geliştirmede yerel disk)
```

- **Modüler monolit**: tek API uygulaması, her iş alanı ayrı NestJS modülü. Mikroservis yok.
- **API-first**: web hiçbir iş kuralını kendisi uygulamaz; tüm kurallar API'dedir (mobil aynı kuralları alır).
- `packages/shared`: enum'lar, yetki kodları, ortak tipler, Zod şemaları — web ve api ikisi de kullanır.

## 2. Repo Yapısı

```
apps/
  api/                 NestJS + Prisma
    prisma/
      schema/          Çok dosyalı Prisma şeması (modül başına bir .prisma dosyası)
      seed.ts
    src/
      common/          guard, decorator, filter, pipe, tenant context, pagination
      core/            prisma, config, auth, tenants, users, org, roles, audit, files, notifications, actions
      modules/         kpi, meetings, strategy, hoshin, problems, audits, suggestions ...
  web/                 Next.js (App Router) + Tailwind
    src/
      app/(auth)/      giriş sayfaları
      app/(app)/       oturum gerektiren sayfalar (layout: sidebar + topbar)
      components/ui/   temel UI bileşenleri (Button, Input, Table, Dialog ...)
      lib/             api istemcisi, auth, i18n
      messages/        tr.json, en.json
packages/
  shared/              @lean/shared
docs/
docker-compose.yml     postgres, redis
```

## 3. Çok Şirketlilik (Multi-Tenancy)

- **Paylaşımlı veritabanı, paylaşımlı şema**; şirkete ait her tabloda `tenantId` kolonu (zorunlu, indeksli).
- İstek başına **tenant bağlamı** `AsyncLocalStorage` (nestjs-cls) ile tutulur; JWT'deki `tid` alanından doldurulur.
- `PrismaService` üzerinde **tenant extension**: tenant'a ait modellerde `findMany/findFirst/count/update/delete...` sorgularına otomatik `where.tenantId`, `create`'e otomatik `tenantId` eklenir. Servis kodu `tenantId` yazmayı unutsa bile veri sızmaz.
- Tenant'a ait olmayan modeller (ör. `Tenant`, `PlatformAdmin`) extension dışında tutulur.
- Sertleştirme (Faz 5): PostgreSQL Row-Level Security.

## 4. Kimlik Doğrulama ve Yetkilendirme

### 4.1 Giriş
- Giriş bilgisi: **şirket kodu + kullanıcı adı (e-posta veya sicil no) + şifre**.
- Access token (JWT, 15 dk) + refresh token (30 gün, DB'de hash'li, rotasyonlu).
- JWT payload: `{ sub: userId, tid: tenantId, sa?: true (platform admin) }`.
- İlk girişte / admin sıfırlamasında `mustChangePassword` bayrağı.

### 4.2 Yetki modeli: Rol + Kapsam
- **Permission**: sabit kod listesi, `packages/shared/src/permissions.ts` (ör. `kpi.manage`, `kpi.value.enter`, `action.manage`).
- **Role**: şirket bazlı, izin kümesi. Sistem rolleri seed ile oluşur (silinemez), şirket yeni rol ekleyebilir.
- **UserRole**: kullanıcıya rol atanır + opsiyonel **kapsam** (`orgUnitId`). Kapsam boşsa tüm şirket; doluysa o birim ve altı.
- Uç noktalarda `@RequirePermissions('kpi.manage')` dekoratörü + `PermissionsGuard`.
- Veri görünürlüğü (birim bazlı) servis katmanında `AccessService.getScopedOrgUnitIds(user, permission)` ile uygulanır.

### 4.3 Sistem rolleri (seed)
`TENANT_ADMIN`, `EXECUTIVE`, `MANAGER`, `QUALITY_COORDINATOR`, `KPI_OWNER`, `AUDITOR`, `COMMITTEE_MEMBER`, `EMPLOYEE` (herkese varsayılan).

## 5. Organizasyon Modeli

- `OrgUnit`: `parentId` (adjacency) + `path` (materialized path, ör. `/a1b2/c3d4/`) + `level` + `type` (COMPANY, SITE, DIRECTORATE, DEPARTMENT, UNIT, LINE, AREA).
- Alt ağaç sorgusu: `path LIKE '/…/%'`.
- `Employee` (personel kartı) ↔ `User` (giriş hesabı) birebir opsiyonel. Saha çalışanı için ikisi de oluşturulur.

## 6. Ortak Çapraz Bileşenler

| Bileşen | Model | Not |
|---------|-------|-----|
| Aksiyon | `Action` (+ `ActionHistory`, `ActionComment`) | `sourceType` + `sourceId` polimorfik kaynak. Tüm modüller aksiyonları **ActionsService.create()** ile açar, kendi aksiyon tablosu yapmaz. |
| Denetim izi | `AuditLog` | `entity`, `entityId`, `action`, `userId`, `diff (Json)` |
| Dosya | `Attachment` | `entityType` + `entityId`; depolama `StorageService` arkasında (yerel disk / S3). |
| Bildirim | `Notification` | Uygulama içi + e-posta (SMTP, geliştirmede konsola log). |
| İçe aktarma | `ImportJob` | Excel sihirbazı: yükle → önizle → eşleştir → doğrula → işle. |
| API anahtarı | `ApiKey` | Hash'li, izin kapsamlı, son kullanım tarihi. |

### Aksiyon durumları
`OPEN` → `IN_PROGRESS` → `DONE` (tamamlandı, doğrulama bekliyor) → `VERIFIED` (kapandı); `CANCELLED`.
"Gecikmiş" bir durum değil, hesaplanan bayraktır: `dueDate < bugün && status in (OPEN, IN_PROGRESS)`.

### Aksiyon kaynak tipleri
`MEETING`, `KPI_DEVIATION`, `PROBLEM`, `AUDIT_FINDING`, `HOSHIN`, `SUGGESTION`, `KAIZEN`, `MANUAL`.

## 7. API Kuralları

- Önek: `/api/v1`. JSON. Tarih: ISO 8601 (UTC). Dönemler: `YYYY-MM` (aylık), `YYYY-Www` (haftalık), `YYYY-MM-DD` (günlük), `YYYY-Qn`, `YYYY`.
- Listeleme: `?page=1&pageSize=20&sort=createdAt:desc&q=arama` → `{ items, total, page, pageSize }`.
- Doğrulama: `class-validator` DTO'ları (global `ValidationPipe`, `whitelist: true`, `transform: true`).
- Hata formatı: `{ statusCode, message, code?, details? }`. İş kuralı hataları `422` + `code` (ör. `DEVIATION_REQUIRED`).
- Her controller Swagger dekoratörleriyle dokümante edilir (`@ApiTags`, `@ApiBearerAuth`).
- Silme: iş kayıtlarında **soft delete** (`deletedAt`) tercih edilir; kalite kayıtları kalıcı silinmez.

## 8. Veritabanı Kuralları

- ID: `String @id @default(cuid())`.
- Her tenant tablosunda: `tenantId`, `createdAt`, `updatedAt`, gerektiğinde `createdById`, `deletedAt`.
- Prisma şeması **çok dosyalı**: `apps/api/prisma/schema/<modül>.prisma`. Her modül kendi dosyasını yönetir; çekirdek modellere (User, Tenant, OrgUnit) ters ilişki eklemek gerekirse ilgili satır `core.prisma`'ya eklenir.
- Migration: `pnpm --filter @lean/api exec prisma migrate dev --name <açıklama>` (dosyalar `prisma/schema/migrations/` altında).
- Create işlemlerinde **unchecked input** kullanın (`ownerId: x`, `owner: { connect }` değil) ve `tenantId: this.ctx.tenantId` verin; tenant extension `tenantId` alanını ayrıca zorlar. Nested create'lerde alt kayıtlara da `tenantId` verilmelidir.
- `prisma.db` = tenant izolasyonlu istemci (varsayılan). `prisma.raw` = filtresiz; yalnız auth, platform yönetimi ve zamanlanmış işlerde.
- Sayısal KPI değerleri: `Decimal(18,4)`.

## 9. Frontend Kuralları

- Next.js App Router, **istemci tarafı veri çekme** (TanStack Query) — sayfalar `"use client"` olabilir; SSR zorunlu değil.
- API çağrıları yalnızca `src/lib/api.ts` istemcisi üzerinden (token ekleme, 401'de refresh).
- UI: Tailwind + `components/ui` içindeki bileşenler. Yeni ortak bileşen gerekiyorsa oraya eklenir.
- Metinler: `messages/tr.json` ve `messages/en.json` — kod içinde sabit Türkçe metin yazılmaz, `t('kpi.title')` kullanılır.
- Grafik: Recharts. Durum renkleri: yeşil = hedefte, sarı = uyarı, kırmızı = hedef altı / gecikmiş, gri = veri yok.
- Mobil uyumlu (responsive) tasarım zorunlu: saha kullanıcıları telefondan girer.
- Menü öğeleri yetkiye göre gösterilir.

## 10. Modül Geliştirme Kalıbı

Yeni bir iş modülü (ör. `modules/kpi`) şu kalıbı izler:
1. `prisma/schema/<modül>.prisma` + migration; `packages/shared` içine izin kodları ve yanıt tipleri.
2. `src/modules/<modül>/` altında NestJS modülü; `AppModule.imports` listesine eklenir.
3. Aksiyon açmak için `ActionsService.create({... sourceType, sourceId, sourceLabel })`; kaynağa bağlı aksiyonlar `ActionsService.listBySource()`.
4. Aksiyon kapanışını dinlemek için `DomainEvents.on(ActionEvents.StatusChanged, ...)`.
5. Excel içe aktarma için `Importer` arayüzünü uygulayan sınıf, `onModuleInit` içinde `ImportRegistry.register(this)`.
6. Kişisel panoya kart: `DashboardService.registerWidget('<modül>.<kart>', fn)`.
7. Bildirim: `NotificationsService.notify({ userIds, type, title, link, dedupeKey })`.
8. Değişiklik kaydı: `AuditService.log(entity, id, action, diff)`.
9. Zamanlanmış iş: `@Cron` + `RequestContext.runForTenant()` ile her şirket için çalıştırın.

## 11. Test ve Kalite

- API: Jest birim testleri (iş kuralları için zorunlu: KPI durum hesaplama, sapma zorunluluğu, aksiyon gecikme vb.) + e2e testleri (supertest) kritik akışlar için.
- Lint: ESLint + Prettier. `pnpm lint`, `pnpm typecheck`, `pnpm test` CI'da çalışır.

## 12. Geliştirme Ortamı

```
docker compose up -d          # postgres + redis
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm --filter @lean/api exec prisma migrate deploy
pnpm --filter @lean/api seed  # demo şirket: kod DEMO, kullanıcı admin / Admin123!
pnpm dev                      # api :4000 (Swagger: /api/docs), web :3000
pnpm --filter @lean/api test:e2e   # lean_test veritabanı gerekir
```
