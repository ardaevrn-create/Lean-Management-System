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

---

## Strateji & Hoshin (M2 + M3)

Önekler `/strategy` (M2) ve `/hoshin` (M3). Tek NestJS modülü: `StrategyModule`. Tüm değişiklikler `AuditService` ile kaydedilir.
Yetki: `strategy.view/manage`, `hoshin.view/manage`. Hoshin okuma uç noktaları ek yetki istemez; veri **hedef bazında filtrelenir**: hedef sahibi kendi hedeflerini, alt ağacını ve üst hedeflerini her zaman görür; `hoshin.view` olanlar atılım/yıllık/öncelik hedeflerini ve (kapsamındaki) birim/bireysel hedefleri görür. `hoshin.manage` kapsamsızsa her hedefi, kapsamlıysa yalnız kapsamdaki birim/bireysel hedefleri yönetir; üst hedef sahibi alt hedef ekler/düzenler.

### Stratejik plan (M2)
| Yöntem | Yol | Girdi | Çıktı |
|---|---|---|---|
| GET | `/strategy/plans` | — `strategy.view` | `StrategyPlanBrief[]` |
| POST | `/strategy/plans` | `{ name, startYear, endYear, vision?, mission?, values?[] }` — `strategy.manage` | `StrategyPlanDetail` |
| GET / PATCH / DELETE | `/strategy/plans/:id` | silme yalnız taslak ve hedefsiz plan | `StrategyPlanDetail` (SWOT + amaçlar dahil) |
| POST | `/strategy/plans/:id/activate` | şirkette tek ACTIVE plan: öncekiler ARCHIVED olur, onaylayan/tarih yazılır | `StrategyPlanDetail` |
| POST | `/strategy/plans/:id/new-version` | SWOT, amaçlar, hedef ağacı ve X-matrix'i taslak olarak kopyalar (`version+1`) | `StrategyPlanDetail` |
| POST | `/strategy/plans/:id/swot` · PATCH/DELETE `/strategy/swot/:id` | `{ type, text, impact 1–5, sortOrder? }` | `SwotItemDto` |
| POST | `/strategy/plans/:id/objectives` · PATCH/DELETE `/strategy/objectives/:id` | `{ code?(SA1…), title, description?, perspective?(BSC), ownerId? }` | `StrategicObjectiveDto` |

### Hoshin hedefleri (M3-01/02/03)
| Yöntem | Yol | Girdi | Çıktı |
|---|---|---|---|
| GET | `/hoshin/plans` | (yetki gerekmez) | `StrategyPlanBrief[]` |
| GET | `/hoshin/plans/:id/tree` | `year?` | `HoshinTreeResponse` — atılım hedefi her zaman; diğerleri yıla göre; ilerleme (başarım %, renk) dahil |
| GET | `/hoshin/goals` | `planId?, year?, level?, mine?` | `HoshinGoalRow[]` |
| POST | `/hoshin/goals` | `{ planId, parentId?, level, code?, title, year?, objectiveId?, orgUnitId?, ownerId?, kpiId?, unit?, baseline?, targetValue?, direction?, aggregation?, weight?, startDate?, endDate?, propose? }` — seviye/üst hedef: BREAKTHROUGH→ANNUAL→PRIORITY→DEPARTMENT→INDIVIDUAL (DEPARTMENT, ANNUAL'ın altında da olabilir); aksi `422 INVALID_PARENT_LEVEL` / `PARENT_REQUIRED`; kod boşsa `AH1, YH2, OP3, BH4, KH5` otomatik; KPI bağlanırsa yön/birim/toplulaştırma KPI'dan kopyalanır; `propose=true` catchball başlatır | `HoshinGoalDetail` |
| GET | `/hoshin/goals/:id` | `year?` | `HoshinGoalDetail`: üst zincir, bowling satırı, alt hedefler (başarım), catchball yazışması, `HOSHIN` aksiyonları, `catchballState`, `can` |
| PATCH / DELETE | `/hoshin/goals/:id` | `UpdateGoalDto` (silme: alt hedefsiz, aktif olmayan) | `HoshinGoalDetail` |
| POST | `/hoshin/goals/:id/status` | `{ status: COMPLETED\|CANCELLED\|ACTIVE }` | `HoshinGoalDetail` |

### Catchball (M3-05)
Taraflar: **PARENT** (üst hedef sahibi / `hoshin.manage`) ve **CHILD** (atanan sahip). Akış: `DRAFT —PROPOSAL(PARENT)→ PROPOSED —COUNTER_PROPOSAL→ IN_CATCHBALL —AGREEMENT(karşı taraf)→ AGREED —activate→ ACTIVE`. `AGREEMENT` yalnız karşı tarafın son öneri/karşı önerisine verilebilir; hedef değer o önerideki sayıya güncellenir ve `agreedAt` yazılır. `REJECTION` hedefi `DRAFT`'a döndürür (gerekçe zorunlu). AGREED sonrası giriş `422 CATCHBALL_CLOSED`. Her girişte karşı tarafa bildirim.
| Yöntem | Yol | Girdi | Çıktı |
|---|---|---|---|
| POST | `/hoshin/goals/:id/catchball` | `{ type: PROPOSAL\|COMMENT\|COUNTER_PROPOSAL\|AGREEMENT\|REJECTION, message?, proposedTarget?, side? }` | `CatchballEntryDto[]` |
| POST | `/hoshin/goals/:id/activate` | AGREED (veya catchball gerektirmeyen DRAFT) → ACTIVE; üst hedef sahibi / yönetici | `HoshinGoalDetail` |
| GET | `/hoshin/catchball` | benim dahil olduğum PROPOSED / IN_CATCHBALL hedefler | `CatchballListItem[]` (`awaitingMe`) |

### X-Matrix (M3-04)
| Yöntem | Yol | Girdi | Çıktı |
|---|---|---|---|
| GET | `/hoshin/plans/:id/x-matrix` | `year?` | `XMatrixResponse`: `breakthroughs` (güney), `annuals` (batı), `priorities` (kuzey), `kpis` (doğu), `owners` (uzak doğu), `correlations[{ fromGoalId, targetType GOAL\|KPI\|USER, targetId, strength STRONG\|MEDIUM\|WEAK, role? }]` |
| PUT | `/hoshin/plans/:id/correlations` | `{ year, items[] }` — plan+yıl için tam küme; geçerli: ANNUAL→GOAL(BREAKTHROUGH), PRIORITY→GOAL(ANNUAL)/KPI/USER, BREAKTHROUGH→KPI; aksi `422 INVALID_CORRELATION`; kapsamsız `hoshin.manage` | `XMatrixResponse` |

### Aylık takip, bowling chart ve sapma (M3-06/07/08)
| Yöntem | Yol | Girdi | Çıktı |
|---|---|---|---|
| GET | `/hoshin/bowling` | `planId?, year?, orgUnitId? \| goalId?, level?, measuredOnly?` | `BowlingResponse`: satır başına 12 ay `{ plan, actual, status GREEN\|YELLOW\|RED\|NO_DATA, comment }`, YTD, başarım %. KPI bağlı hedefte plan = KPI hedefi (yoksa hedef değer), gerçekleşme = KPI değeri (AYLIK ve 3 aylık KPI doğrudan; 3 aylık dönem sonu ayına; günlük/haftalık aya toplulaştırılır; yıllık Aralık'a); renk KPI durum kuralı + KPI toleransı (elle hedeflerde %5) |
| GET | `/hoshin/bowling/export` | aynı | `.xlsx` |
| PUT | `/hoshin/goals/:id/monthly` | `{ year, months:[{ month 1–12, plan?, actual?, comment? }] }` — yalnız KPI bağlı olmayan hedef; plan: yönetici / üst hedef sahibi; gerçekleşme + açıklama: ayrıca hedef sahibi | `BowlingRow` |
| GET | `/hoshin/goals/:id/off-target` | `period=YYYY-MM` | `OffTargetDetail`: KPI hedefte → bağlı KPI sapması (açıklama + `KPI_DEVIATION` aksiyonları); elle hedefte → aylık açıklama + `HOSHIN` aksiyonları |
| POST | `/hoshin/goals/:id/countermeasure` | `{ period, explanation?, title, ownerId, dueDate, priority?, description? }` — `ActionsService.create`, `sourceType=HOSHIN`, `sourceId=goal.id`, `sourceLabel="<kod> <başlık> – <YYYY-MM>"` | `OffTargetDetail` |

### İlerleme, drill-down ve yıllık değerlendirme (M3-09/10)
Başarım %: HIGHER_BETTER `(gerçekleşen−başlangıç)/(hedef−başlangıç)`, LOWER_BETTER yansıması; 0..150 aralığına sıkıştırılır; başlangıç yoksa 0 (HIGHER) / hedef÷gerçekleşen (LOWER) kabul edilir. Toplam (SUM) toplulaştırmalı hedeflerde hedef YTD plana (yoksa yıllık×ay/12) göre orantılanır. Doğrudan ölçümü olmayan üst hedefte başarım, alt hedeflerin ağırlıklı ortalamasıdır; renk: ≥100 yeşil, ≥95 sarı, altı kırmızı (doğrudan ölçümlü hedefte son ayın rengi).
| Yöntem | Yol | Girdi | Çıktı |
|---|---|---|---|
| GET | `/hoshin/plans/:id/drilldown` | `year?, parentId?` | `{ parent, items[], orgUnits[{ orgUnit, goalCount, achievement, green, yellow, red }] }` (şirket → birim) |
| GET | `/hoshin/plans/:id/review` | `year?` | `ReviewResponse`: hedef başına hedef, YTD, başarım, renk, açık/geciken aksiyon, catchball mutabakat tarihi + özet |
| GET | `/hoshin/plans/:id/tree/export` | `year?` | `.xlsx` hedef ağacı |

### Zamanlanmış iş, kartlar ve ekler
Her ayın 3'ü 08:00 (Europe/Istanbul, `schedulerEnabled` kapalıysa atlanır): elle takip edilen aktif hedeflerde geçen ayın gerçekleşmesi girilmemişse sahibine bildirim (`dedupeKey`, tekrar yok); `HoshinReminderJob.runForCurrentTenant(today)`. Ana sayfa: `GET /dashboard/me` → `widgets.hoshin = { myGoals, redGoals, catchballPending }`. Dosya ekleri: `entityType="HOSHIN_GOAL"`. Web: `/hoshin` (sekmeler), `/hoshin/goals/[id]`, `/hoshin/review/print?planId&year`.
