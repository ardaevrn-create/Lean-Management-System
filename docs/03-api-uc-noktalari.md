# API Uç Noktaları (Faz 0 – Çekirdek)

Tüm yollar `/api/v1` önekli. Yanıt tipleri `packages/shared/src/contracts.ts` içinde.
Kimlik: `Authorization: Bearer <accessToken>` veya `x-api-key: <anahtar>` (entegrasyonlar).
Listeleme parametreleri: `page`, `pageSize`, `q`, `sort` → `Paginated<T>`.

## Auth
| Metot | Yol | Gövde / Parametre | Yanıt |
|---|---|---|---|
| POST | `/auth/login` | `LoginRequest` | `LoginResponse` |
| POST | `/auth/refresh` | `{ refreshToken }` | `TokenPair` |
| POST | `/auth/logout` | `{ refreshToken }` | `204` |
| GET | `/auth/me` | | `AuthUser` |
| POST | `/auth/change-password` | `ChangePasswordRequest` | `204` |

## Şirket
| GET | `/tenant` | | `TenantInfo` |
| PATCH | `/tenant` | `Partial<TenantInfo>` (name, locale, timezone, primaryColor) | `TenantInfo` |
| POST | `/platform/tenants` | `{ code, name, adminUsername, adminPassword, adminFullName, adminEmail? }` (platform admin) | `TenantInfo` |
| GET | `/platform/tenants` | | `TenantInfo[]` |

## Organizasyon
| GET | `/org-units` | | `OrgUnit[]` (düz) |
| GET | `/org-units/tree` | | `OrgUnitNode[]` |
| POST | `/org-units` | `{ name, code?, type, parentId?, managerEmployeeId?, sortOrder? }` | `OrgUnit` |
| PATCH | `/org-units/:id` | aynı alanlar (parentId değişirse alt ağaç taşınır) | `OrgUnit` |
| DELETE | `/org-units/:id` | alt birim / personel varsa `422` | `204` |
| GET | `/employees` | `q, orgUnitId, includeSubUnits, isActive, page, pageSize` | `Paginated<Employee>` |
| GET | `/employees/:id` | | `Employee` |
| POST | `/employees` | `{ employeeNo, firstName, lastName, title?, email?, phone?, hireDate?, orgUnitId?, managerId?, createUser?: boolean }` | `Employee` (+ `credential?: CreatedCredential`) |
| PATCH | `/employees/:id` | aynı alanlar + `isActive` | `Employee` |
| DELETE | `/employees/:id` | pasife alır | `204` |
| GET/POST | `/teams` | `{ name, type, description?, members: {employeeId, role?}[] }` | `Team[]` / `Team` |
| PATCH/DELETE | `/teams/:id` | | `Team` / `204` |

## Kullanıcı & Rol
| GET | `/users` | `q, page, pageSize, isActive` | `Paginated<UserListItem>` |
| POST | `/users` | `{ username, fullName, email?, password?, employeeId?, roleIds? }` | `CreatedCredential` |
| PATCH | `/users/:id` | `{ fullName?, email?, isActive?, locale? }` | `UserListItem` |
| POST | `/users/:id/reset-password` | | `CreatedCredential` |
| PUT | `/users/:id/roles` | `{ assignments: { roleId, orgUnitId? }[] }` | `UserListItem` |
| POST | `/users/bulk-from-employees` | `{ employeeIds: string[] }` | `CreatedCredential[]` |
| GET | `/roles` | | `Role[]` |
| GET | `/roles/permissions` | | `{ code: string; group: string }[]` |
| POST/PATCH/DELETE | `/roles(/:id)` | `{ code, name, description?, permissions }` (sistem rolleri silinemez) | `Role` |

## Aksiyonlar
| GET | `/actions` | `view=mine\|team\|created\|all`, `status` (virgüllü), `overdue=true`, `sourceType`, `sourceId`, `ownerId`, `orgUnitId`, `q`, `page`, `pageSize`, `sort` | `Paginated<ActionListItem>` |
| GET | `/actions/stats` | aynı filtreler | `ActionStats` |
| GET | `/actions/:id` | | `ActionDetail` |
| POST | `/actions` | `CreateActionRequest` | `ActionDetail` |
| PATCH | `/actions/:id` | `{ title?, description?, ownerId?, priority?, progress?, orgUnitId?, supporterIds?, dueDate? (yalnız yönetici/oluşturan) }` | `ActionDetail` |
| POST | `/actions/:id/status` | `{ status, note? }` (DONE için note zorunlu) | `ActionDetail` |
| POST | `/actions/:id/comments` | `{ body }` | `ActionComment` |
| POST | `/actions/:id/due-date-requests` | `{ newDueDate, reason }` | `DueDateRequest` |
| POST | `/actions/due-date-requests/:requestId/decide` | `{ approve: boolean, note? }` | `DueDateRequest` |
| GET | `/actions/export` | aynı filtreler | `.xlsx` |

## Bildirim
| GET | `/notifications` | `unread=true, page, pageSize` | `Paginated<NotificationItem>` |
| GET | `/notifications/unread-count` | | `{ count }` |
| POST | `/notifications/:id/read` | | `204` |
| POST | `/notifications/read-all` | | `204` |

## Dosya Ekleri
| POST | `/attachments` | multipart: `file`, `entityType`, `entityId` | `AttachmentItem` |
| GET | `/attachments` | `entityType, entityId` | `AttachmentItem[]` |
| GET | `/attachments/:id/download` | | dosya |
| DELETE | `/attachments/:id` | | `204` |

## Excel İçe Aktarma (sürükle-bırak sihirbazı)
| GET | `/imports/types` | | `ImportTypeInfo[]` (yetkiye göre) |
| GET | `/imports/types/:type/template` | | `.xlsx` şablon |
| POST | `/imports/upload` | multipart: `file`, `type` | `ImportPreview` |
| POST | `/imports/:jobId/validate` | `ImportMappingRequest` | `ImportValidationResult` |
| POST | `/imports/:jobId/commit` | `ImportMappingRequest` | `ImportCommitResult` |

Faz 0 içe aktarma tipleri: `org-units`, `employees`, `actions`. Modüller kendi tiplerini ekler (ör. `kpi-values`).

## Diğer
| GET | `/audit-logs` | `entity, entityId, userId, page, pageSize` | `Paginated<AuditLogItem>` |
| GET | `/dashboard/me` | | `MyDashboard` |
| GET | `/health` | | `{ status: 'ok' }` |

## KPI (M8)

Önek `/api/v1/kpi`. Dönem anahtarları: `YYYY-MM-DD` (günlük), `YYYY-Www` (haftalık, ISO), `YYYY-MM`, `YYYY-Qn`, `YYYY`. Okuma uç noktalarında kapsam: `kpi.view` (birim kapsamı) + kullanıcının sahibi / veri giriş sorumlusu olduğu KPI'lar (kpi.view olmasa da). Değer girişi: veri giriş sorumlusu, sahip veya `kpi.value.enter` (kapsamda). Tanım/hedef yönetimi: `kpi.manage` (kapsamda). Sapma onayı: `kpi.deviation.approve` (kapsamda) ya da KPI sahibinin yöneticisi. Tüm değişiklikler denetim izine yazılır. İş kuralı hataları `422` + `code` (`REASON_REQUIRED`, `CALCULATED_KPI`, `FUTURE_PERIOD`, `INVALID_PERIOD`, `INVALID_FORMULA`, `CODE_TAKEN`, `FREQUENCY_LOCKED`, `DEVIATION_NOT_REQUIRED`, `ACTION_REQUIRED`, `NOTE_REQUIRED`, `ALREADY_DECIDED`).

**Durum kuralı:** tolerans = |hedef| × `warningTolerancePct`/100. `HIGHER_BETTER`: değer ≥ hedef → GREEN, ≥ hedef − tol → YELLOW, aksi RED. `LOWER_BETTER` tersi. `RANGE`: hedef ≤ değer ≤ hedefMax → GREEN, bandın dışında tolerans içinde YELLOW, aksi RED. Hedef yoksa `NO_TARGET`.
**Giriş durumu (`entryState`, hesaplanır):** `NOT_DUE` (değer yok, son giriş tarihi = dönem sonu + `entryDueDays` geçmedi) · `MISSING` · `DEVIATION_REQUIRED` (sarı: açıklama; kırmızı: açıklama + en az 1 aksiyon; reddedilen açıklama tekrar gerekli) · `PENDING_APPROVAL` · `COMPLETE`.

### Tanım ve hedefler
| Yöntem | Yol | Girdi | Çıktı |
|---|---|---|---|
| GET | `/kpi/definitions` | `q, orgUnitId (alt birimler dahil), category, frequency, ownerId, mine=true, isActive, page, pageSize, sort` | `Paginated<KpiListItem>` (son durum özeti: `duePeriod, entryState, lastPeriod, lastValue, lastTarget, lastStatus, missingCount, deviationRequiredCount`) |
| GET | `/kpi/definitions/:id` | | `KpiDefinitionDetail` |
| POST | `/kpi/definitions` | `KpiDefinitionRequest` (formül: `({A} / {B}) * 100`; referanslar aynı periyotta, döngüsüz) | `KpiDefinitionDetail` |
| PATCH | `/kpi/definitions/:id` | kısmi (kod değişmez; değer/hedef varken `frequency` değişmez) | `KpiDefinitionDetail` |
| DELETE | `/kpi/definitions/:id` | | `204` (pasife alır, geçmiş korunur) |
| GET | `/kpi/definitions/:id/targets` | `from, to` (dönem; varsayılan: bu yıl) | `KpiTargetItem[]` |
| PUT | `/kpi/definitions/:id/targets` | `{ targets: [{ period, target, targetMax? }] }` (`target: null` siler; ≤400) | `KpiTargetItem[]` (değerlerin durumu yeniden hesaplanır) |

### Değerler ve veri girişi
| Yöntem | Yol | Girdi | Çıktı |
|---|---|---|---|
| GET | `/kpi/definitions/:id/series` | `from, to` (dönem; varsayılan son 12) | `KpiSeries` (nokta başına hedef/değer/durum/giriş durumu/sapma/aksiyon sayısı/önceki yıl; `ytd` ve `previousYearYtd` KPI'nın `aggregation` kuralıyla) |
| GET | `/kpi/definitions/:id/revisions` | `period?` | `KpiRevisionItem[]` |
| PUT | `/kpi/values` | `{ kpiId, period, value, note?, reason? }` — mevcut değer değişiyorsa `reason` zorunlu | `KpiValueResult` (`status, entryState, requiresExplanation, requiresAction`) |
| POST | `/kpi/values/bulk` | `{ items: [{ kpiCode\|kpiId, period, value, note? }], reason? }` — entegrasyon (API anahtarı, `kpi.value.enter`) | `BulkKpiValuesResult` (satır bazlı, kısmi başarı) |
| GET | `/kpi/entry` | `period?` (referans; her KPI için bu referansta biten son dönem), `frequency?` | `KpiEntryResponse` (sıklığa göre gruplu çalışma listesi; varsayılan: son tamamlanan dönem) |

Hesaplanan (formüllü) KPI'lara manuel giriş yapılamaz (`CALCULATED_KPI`); girdileri değişince değerleri otomatik üretilir (`source=CALCULATED`).

### Eksik veri ve uyum (M8-06)
| Yöntem | Yol | Girdi | Çıktı |
|---|---|---|---|
| GET | `/kpi/missing` | `orgUnitId?, from?, to?` (son giriş tarihi aralığı, `YYYY-MM-DD`) | `{ total, items: [{ kpi, period, dueDate, daysLate, responsible, orgUnit }] }` (KPI başına son 12 dönem) |
| GET | `/kpi/missing/export` | aynı | `.xlsx` |
| GET | `/kpi/compliance` | aynı | `{ overall, byOrgUnit[], byPerson[] }` — beklenen / zamanında / geç / eksik / uyum % / tamamlanma % |
| GET | `/kpi/compliance/export` | `by=orgUnit\|person` | `.xlsx` |
| GET | `/kpi/summary` | | `{ missing, deviationRequired, pendingApproval, kpiCount, complianceRate }` |

### Sapmalar (M8-08/09)
| Yöntem | Yol | Girdi | Çıktı |
|---|---|---|---|
| GET | `/kpi/deviations` | `state=required\|pending\|all, orgUnitId?` | `KpiDeviationListItem[]` |
| GET | `/kpi/deviations/detail` | `kpiId, period` | `KpiDeviationDetail` (kayıt yoksa da döner) |
| GET | `/kpi/deviations/:id` | | `KpiDeviationDetail` (bağlı aksiyonlar + geçmiş) |
| PUT | `/kpi/deviations` | `{ kpiId, period, explanation, rootCause? }` (REJECTED → PENDING'e döner) | `KpiDeviationDetail` |
| POST | `/kpi/deviations/:id/actions` | `CreateActionRequest` (kaynak alanları hariç) — `ActionsService.create`, `sourceType=KPI_DEVIATION` | `ActionDetail` |
| POST | `/kpi/deviations/:id/decide` | `{ approve, note? }` (reddetmede `note` zorunlu; kırmızıda aksiyon yoksa onay `ACTION_REQUIRED`) | `KpiDeviationDetail` |

### Pano ve besleme (M8-13, I-04)
| Yöntem | Yol | Girdi | Çıktı |
|---|---|---|---|
| GET | `/kpi/board` | `orgUnitId?, period?, includeSub=true` | `KpiBoardResponse` (KPI başına güncel durum + son 6 dönem sparkline) |
| GET | `/kpi/feed` | `from?, to?, orgUnitId?` (`YYYY-MM-DD`; varsayılan geçen yıl başı → bugün) — `x-api-key` + `kpi.view` | `KpiFeedRow[]` düz tablo (Power BI / Excel "Web" bağlayıcısı) |
| GET | `/kpi/feed/export` | aynı | `.xlsx` |

### Excel içe aktarma tipleri
`kpi-definitions` (koda göre ekler/günceller; "Yüksek iyi", "Düşük iyi", "Aralık", "Aylık", "Haftalık"… Türkçe karşılıklar kabul edilir), `kpi-targets`, `kpi-values` (mevcut değerin üzerine yazılırsa revizyon: "Excel içe aktarma"). Dönem hücresi bir tarih de olabilir (ör. `01.10.2026`) — KPI periyoduna çevrilir.

### Zamanlanmış iş ve kartlar
Her gün 07:30 (Europe/Istanbul): eksik giriş → veri giriş sorumlusuna `KPI_VALUE_MISSING` (3 gün gecikmede birim yöneticisine bir kez eskalasyon); açıklaması gereken sapma → KPI sahibine `KPI_DEVIATION_REQUIRED`. Ana sayfa kartı: `GET /dashboard/me` → `widgets.kpi = { toEnter, missing, deviationsRequired, pendingApprovals? }`.
