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
