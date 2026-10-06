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

## Toplantılar (M4)
Yetki: `meeting.view` / `meeting.manage` (birim kapsamlı). Organizatör, katılımcı ve tip kolaylaştırıcısı kendi toplantılarını her zaman görür; organizatör/kolaylaştırıcı/`meeting.manage` toplantıyı yürütür. İş kuralı hataları `422` + `code`: `ATTENDANCE_REQUIRED`, `MEETING_LOCKED`, `INVALID_STATE`, `SERIES_TOO_LARGE`, `SERIES_EMPTY`, `TYPE_INACTIVE`, `INVALID_TIME`.

### Toplantı tipleri
| GET | `/meetings/types` | `includeInactive` | `MeetingTypeItem[]` |
| GET | `/meetings/types/templates` | | `MeetingTemplateInfo[]` (TIER1_DAILY, WEEKLY_DEPARTMENT, MONTHLY_PERFORMANCE, MANAGEMENT_REVIEW) |
| POST | `/meetings/types/templates/:key` | `{ name?, code?, orgUnitId?, facilitatorId?, defaultLocation?, participantIds? }` | `MeetingTypeItem` (kod çakışırsa `-2` eki) |
| POST | `/meetings/types` | `{ name, code, category?, tier?, frequency?, defaultDurationMin?, defaultLocation?, orgUnitId?, facilitatorId?, members?[{userId, role?}], agendaTemplate?[{title, durationMin?, description?}] }` | `MeetingTypeItem` |
| GET | `/meetings/types/:id` | | `MeetingTypeItem` |
| PATCH | `/meetings/types/:id` | kısmi (+ `isActive`) | `MeetingTypeItem` |
| DELETE | `/meetings/types/:id` | | pasife alır, `MeetingTypeItem` |

### Toplantılar
| GET | `/meetings` | `view=mine\|all, typeId, orgUnitId, status, when=upcoming\|past, from, to, q, page, pageSize, sort` | `Paginated<MeetingListItem>` |
| POST | `/meetings` | `{ typeId?, title?, startAt, endAt?, durationMin?, location?, onlineUrl?, organizerId?, orgUnitId?, participantIds?, guests? }` | `MeetingDetail` — tipten gündem/katılımcı/süre/yer/birim kopyalanır; organizatör otomatik `ORGANIZER`; katılımcılara `MEETING_INVITED` bildirimi |
| GET | `/meetings/:id` | | `MeetingDetail` (katılımcılar, gündem, kararlar, `can: {edit, run, manage}`, `locked`) |
| PATCH | `/meetings/:id` | `{ title?, startAt?, endAt?, location?, onlineUrl?, organizerId?, orgUnitId?, summary?, guests? }` | `MeetingDetail` |
| POST | `/meetings/:id/start` | | `PLANNED → IN_PROGRESS` |
| POST | `/meetings/:id/complete` | | `COMPLETED`; tüm katılımcıların katılımı girilmemişse `422 ATTENDANCE_REQUIRED`; katılımcılara "tutanak hazır" bildirimi (+e-posta) |
| POST | `/meetings/:id/cancel` | `{ reason }` | `CANCELLED` |
| POST | `/meetings/:id/reopen` | | `COMPLETED → IN_PROGRESS` (yalnız `meeting.manage`, denetim izine yazılır) |
| PUT | `/meetings/:id/participants` | `{ participants: [{ userId, role? }] }` | `MeetingDetail` (tam liste) |
| PATCH | `/meetings/:id/attendance` | `{ items: [{ userId, attendance }] }` | `MeetingDetail` |
| PUT | `/meetings/:id/agenda` | `{ items: [{ id?, title, description?, presenterId?, durationMin? }] }` (sıralı tam liste) | `MeetingAgendaItem[]` |
| PATCH | `/meetings/:id/agenda/:itemId` | `{ discussion?, isCompleted? }` | `MeetingAgendaItem` |
| POST | `/meetings/:id/decisions` | `{ text, agendaItemId? }` | `MeetingDecisionItem` |
| PATCH | `/meetings/:id/decisions/:decisionId` | `{ text?, agendaItemId? }` | `MeetingDecisionItem` |
| DELETE | `/meetings/:id/decisions/:decisionId` | | `204` |
| POST | `/meetings/:id/actions` | `CreateActionRequest` (kaynak alanları hariç; `sourceType=MEETING`, `sourceId=meeting.id` sunucuda atanır) | `ActionDetail` |
| GET | `/meetings/:id/actions` | | `ActionListItem[]` (bu toplantıda açılanlar) |
| GET | `/meetings/:id/carried-actions` | | `MeetingCarriedAction[]` — aynı tipteki (tipsizse aynı seri) önceki toplantılardan açık/doğrulama bekleyen ve son toplantıdan beri kapanan aksiyonlar |
| GET | `/meetings/:id/ics` | | `text/calendar` (.ics) |
| GET | `/meetings/export` | `/meetings` filtreleri | `.xlsx` |
| GET | `/meetings/calendar` | `from, to, typeId, orgUnitId` | `MeetingCalendarItem[]` |
| GET | `/meetings/stats` | `typeId, orgUnitId, from, to` | `MeetingStats` (yapılan/planlanan/iptal, katılım oranı, açılan/zamanında kapanan/geciken aksiyon, tip kırılımı) |

### Tekrarlayan toplantı serileri
| POST | `/meetings/series` | `{ typeId?, title?, firstDate, untilDate, time:"HH:mm", frequency: DAILY\|WEEKLY\|BIWEEKLY\|MONTHLY\|QUARTERLY, weekdays?[1-7], skipWeekends?, durationMin?, participantIds?, location?, onlineUrl?, organizerId?, orgUnitId? }` | `{ seriesId, count, meetings }` (en fazla 260; saatler şirket saat dilimindedir) |
| GET | `/meetings/series/:seriesId` | | `MeetingListItem[]` |
| PATCH | `/meetings/series/:seriesId` | `{ action: "CANCEL", reason? }` | `{ cancelled }` — serideki gelecekteki planlı toplantılar iptal edilir |

Pano kartı: `GET /dashboard/me` → `widgets.meetings = { upcoming[5], todayCount, minutesPending }`. Zamanlanmış iş: her gün 07:15 (Europe/Istanbul) bugünkü toplantı hatırlatmaları ve dün biten, tutanağı tamamlanmamış toplantılar için organizatör uyarısı.

## Problem Çözme (M5 — DÖF)

Akış: Tanım → Acil Önlem → Kök Neden → Aksiyonlar → Doğrulama → Kapanış (+ İptal). Balık kılçığı ve 5 Neden zorunludur. Numara `PRB-00001`. Aksiyonlar çekirdek `ActionsService` ile `sourceType=PROBLEM`, `sourceId=problem.id` olarak açılır.
Erişim: bildiren, sahip ve ekip üyeleri kendi problemlerini her zaman görür; diğerleri `problem.view`/`problem.manage` kapsamına göre. Düzenleme/ilerletme: sahip, ekip üyesi, `problem.manage`; kapatma/geri alma/iptal: sahip veya `problem.manage`. `POST /problems` için `problem.create` yeterlidir (her çalışan).

| Yöntem | Yol | İstek | Yanıt |
|---|---|---|---|
| GET | `/problems` | `view=mine\|all, phase(csv), source, severity, orgUnitId (alt ağaç), overdue, open, q, page, pageSize, sort` | `Paginated<ProblemListItem>` |
| POST | `/problems` | `{ title, description?, orgUnitId? (boşsa bildirenin birimi), severity?, source?, sourceId?, sourceLabel? }` | `ProblemDetail` (sahip: birim yöneticisi → bildirenin yöneticisi → bildiren) |
| GET | `/problems/:id` | | `ProblemDetail` (tanım, ekip, nedenler, 5 Neden zincirleri, aksiyonlar, doğrulamalar, geçmiş, `gate {nextPhase, canAdvance, missing[]}`, `can`) |
| PATCH | `/problems/:id` | 5N1K, `severity, method, source, orgUnitId, ownerId, containment*, targetCloseDate, verificationDate, customer*, costImpact` | `ProblemDetail` |
| PUT | `/problems/:id/team` | `{ members:[{userId, role?}] }` | `ProblemDetail` |
| POST | `/problems/:id/causes` | `{ category: MAN\|MACHINE\|METHOD\|MATERIAL\|MEASUREMENT\|ENVIRONMENT, text, parentId?, isCandidate? }` | `ProblemDetail` |
| PATCH / DELETE | `/problems/:id/causes/:causeId` | `{ text?, isCandidate?, category?, sortOrder? }` (adaylık kalkınca 5 Neden zinciri silinir) | `ProblemDetail` |
| POST | `/problems/:id/why-chains` | `{ causeId }` (yalnız aday neden; `NOT_CANDIDATE`) | `ProblemDetail` |
| PATCH / DELETE | `/problems/:id/why-chains/:chainId` | `{ rootCause?, confirmed? }` | `ProblemDetail` |
| PUT | `/problems/:id/why-chains/:chainId/steps` | `{ steps:[{question?, answer}] }` (tam sıralı liste) | `ProblemDetail` — zincir ≥3 dolu neden + kök neden ile tamamlanır |
| POST | `/problems/:id/actions` | `{ kind: CONTAINMENT\|CORRECTIVE\|PREVENTIVE\|HORIZONTAL, rootCauseChainId?, title, ownerId, dueDate, ... }` | `ProblemDetail` |
| POST | `/problems/:id/horizontal` | `{ orgUnitIds[], title, dueDate, ownerId (yedek sorumlu), rootCauseChainId? }` | Her birim için HORIZONTAL aksiyon (sorumlu birim yöneticisi) |
| POST | `/problems/:id/phase` | `{ to, note? }` — yalnız bir sonraki ya da bir önceki faz | `ProblemDetail`; kapı ihlali `422` + kod |
| POST | `/problems/:id/verifications` | `{ result: EFFECTIVE\|NOT_EFFECTIVE, note?, plannedDate? }` (yalnız VERIFICATION fazı; `NOT_EFFECTIVE` → ROOT_CAUSE'a döner) | `ProblemDetail` |
| POST | `/problems/:id/cancel` | `{ reason }` | `ProblemDetail` |
| GET | `/problems/stats` | `view, orgUnitId` | `ProblemStats` (faz/şiddet/kaynak kırılımı, geciken, doğrulama bekleyen, ort. kapanış günü, 6M Pareto) |
| GET | `/problems/export` | `/problems` filtreleri | `.xlsx` |
| GET | `/problems/:id/report` | | `ProblemReport` (8D D1–D8 / DÖF yazdırma verisi) |

Faz kapıları (422 `code`): `DEFINITION_INCOMPLETE` (ne/nerede/ne zaman), `CONTAINMENT_REQUIRED`, `FISHBONE_REQUIRED` (≥2 kategoride neden + ≥1 aday), `FIVE_WHY_REQUIRED`, `ROOT_CAUSE_UNADDRESSED`, `CORRECTIVE_REQUIRED`, `ACTIONS_OPEN`, `VERIFICATION_REQUIRED`; ayrıca `INVALID_TRANSITION`, `PROBLEM_LOCKED`, `INVALID_PHASE`, `INVALID_CHAIN`. `details.missing` tüm eksik kodları verir.
Pano kartı: `widgets.problems = { myOpen, overdue, awaitingVerification }`. Zamanlanmış iş: her gün 07:45 (Europe/Istanbul) hedef kapanışı geçen problemler (haftalık tekilleştirilmiş) ve planlanan doğrulama tarihi gelen problemler için sahibine bildirim. Aksiyon durumu değişince tüm düzeltici aksiyonlar bittiyse sahibe "Doğrulamaya hazır" bildirimi gider.
Diğer modüllerden önceden doldurulmuş bildirim: `/problems?new=1&source=KPI_DEVIATION&sourceId=..&sourceLabel=..&orgUnitId=..`.
