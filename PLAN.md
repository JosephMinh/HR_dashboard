# Plan: Replace Dummy Data with Real WFP Data

---

## 1. Core Corrections

This plan supersedes the earlier draft in four important ways:

1. `tempJobId` is **not** a unique key.
   - The workbook contains collisions:
     - `5273` appears twice in "WFP Details - Beyond 2026"
     - `5354` appears in both "WFP Details - 2026" and "WFP Details - Beyond 2026"
   - Therefore `tempJobId` cannot be `@unique` and cannot be the sole relational key.

2. Imports must have their own stable provenance key.
   - Every imported row needs `sourceSheet`, `sourceRow`, and `importKey = "${sheet}:${row}"`.
   - `importKey` becomes the deterministic unique identity for imported jobs.

3. Matching external sheets to jobs must be best-effort, not FK-by-assumption.
   - Budget rows and Tradeoff rows should store raw `tempJobId` values.
   - Optional `matchedJobId` fields can be set only when the match is unambiguous.

4. The import must be deterministic.
   - Do **not** derive persisted values from `new Date()` at seed time.
   - Anything date-relative must either:
     - be computed at read time, or
     - be computed from an explicit pinned `asOfDate` constant documented in code.

---

## 2. Source Data Inventory

Verified directly from the workbook `hr-dashboard/2026 WFP - Approved (1).xlsx`:

| Sheet | Verified rows | Purpose | Handling |
|---|---:|---|---|
| WFP Details - 2026 | 344 usable job rows + 1 buffer row + 1 header row | Primary job data | Seed as Jobs + Candidates + Applications |
| WFP Details - Beyond 2026 | 294 usable job rows + 1 buffer row + 1 header row | Future pipeline | Seed as Jobs |
| 2026 Approved Budget | 511 data rows | Monthly headcount projections | Seed as HeadcountProjection |
| Tradeoffs | 18 data rows after header | Tradeoff and push-out notes | Seed as Tradeoff records after row-type parsing |
| By Function | Pivot | Derived view | Compute dynamically |
| By Grade | Pivot | Derived view | Compute dynamically |
| By Location | Pivot | Derived view | Compute dynamically |
| Other Metrics | Pivot | Derived view | Compute dynamically where feasible |
| Copy to Pres | Summary pivot | Derived view | Compute dynamically where feasible |

Verified totals from the two WFP detail sheets:
- 2026 usable jobs: `344`
- Beyond 2026 usable jobs: `294`
- Total imported jobs: `638`

Verified status breakdown from the 2026 sheet:
- `Open`: `27`
- `Offer`: `1`
- `Agency`: `2`
- `Hired`: `169`
- `HIred`: `1`
- `Hired - CW`: `35`
- blank: `109` (110 in raw parse, but 1 is the buffer row which is excluded from usable rows)

Derived job-status totals:
- `OPEN`: `30`
- `CLOSED`: `205`
- `ON_HOLD`: `403`

Sheets 5-9 are still treated as derived views, but this is only safe after the import schema exposes the fields those views actually need.

---

## 3. Schema Changes

### 3a. Job model changes

Do **not** use `tempJobId` as a unique identifier.

Recommended additions:

| Field | Type | Notes |
|---|---|---|
| importKey | String? @unique | Stable row identity, e.g. `WFP Details - 2026:137`. **Optional** so UI-created jobs don't need one. PostgreSQL allows multiple nulls in a unique column. |
| sourceSheet | String? | Workbook sheet name. Optional for the same reason. |
| sourceRow | Int? | 1-based Excel row number. Optional for the same reason. |
| tempJobId | Int? | Raw spreadsheet temp job id, non-unique |
| function | String? | Raw function |
| employeeType | String? | Raw employee type |
| level | String? | Raw level |
| functionalPriority | String? | Raw Functional Priority |
| corporatePriority | String? | Raw Corp. Priority |
| asset | String? | Raw asset |
| keyCapability | String? @db.Text | Raw long text |
| businessRationale | String? @db.Text | Raw long text |
| milestone | String? @db.Text | Raw long text |
| talentAssessment | String? @db.Text | Raw long text |
| horizon | String? | `"2026"` or `"Beyond 2026"` |
| isTradeoff | Boolean @default(false) | True when Tradeoff? column is non-empty |
| recruitingStatus | String? | Raw recruiting status text |
| fpaLevel | String? | Raw FP&A level classification |
| fpaTiming | String? | Raw FP&A timing classification |
| fpaNote | String? | Raw FP&A note |
| fpaApproved | String? | Raw approval marker |
| hiredName | String? | Raw hired-name cell |
| hibobId | Int? | Raw HiBob ID |
| notes | String? @db.Text | Raw notes |

Reverse relation fields required on Job for the new models:
```prisma
headcountProjections HeadcountProjection[]
tradeoffSources      Tradeoff[] @relation("tradeoffSourceJob")
tradeoffTargets      Tradeoff[] @relation("tradeoffTargetJob")
```

Recommended indexes:

```prisma
@@index([tempJobId])
@@index([function])
@@index([horizon])
@@index([employeeType])
@@index([level])
@@index([status, horizon])
```

### 3b. HeadcountProjection model

Headcount rows should not FK to Job by `tempJobId`.

Recommended model shape:

```prisma
model HeadcountProjection {
  id            String   @id @default(uuid())
  importKey     String   @unique
  sourceRow     Int
  tempJobId     Int?
  rawTempJobId  String?
  matchedJobId  String?
  department    String
  employeeName  String?
  level         String?
  jobTitle      String?
  startDate     DateTime?
  monthlyFte    Json
  createdAt     DateTime @default(now())

  matchedJob    Job?     @relation(fields: [matchedJobId], references: [id], onDelete: SetNull)

  @@index([tempJobId])
  @@index([matchedJobId])
}
```

Rationale:
- `5273` proves raw spreadsheet ids cannot be assumed unique.
- Budget rows `6000 (5357 Previously)` and `6001 (5358 Previously)` should preserve both the raw string and parsed integer.
- The workbook also contains real jobs `6000` and `6001`, so matching logic must not blindly null out those ids.

Matching rule:
- first collect all imported jobs by `tempJobId`
- if exactly one job matches a budget row's `tempJobId`, set `matchedJobId`
- if zero or multiple jobs match, leave `matchedJobId = null` and preserve raw fields

### 3c. Tradeoff model

Tradeoff rows are messy enough that they should be modeled as imported records first, relations second.

Recommended model shape:

```prisma
model Tradeoff {
  id               String   @id @default(uuid())
  importKey        String   @unique
  sourceRow        Int
  rowType          String
  sourceTempJobId  Int?
  sourceJobId      String?
  sourceDepartment String?
  sourceLevel      String?
  sourceTitle      String?
  targetTempJobId  Int?
  targetJobId      String?
  targetDepartment String?
  targetLevel      String?
  targetTitle      String?
  levelDifference  Int?
  status           String?
  notes            String?  @db.Text
  createdAt        DateTime @default(now())

  sourceJob        Job?     @relation("tradeoffSourceJob", fields: [sourceJobId], references: [id], onDelete: SetNull)
  targetJob        Job?     @relation("tradeoffTargetJob", fields: [targetJobId], references: [id], onDelete: SetNull)

  @@index([sourceTempJobId])
  @@index([targetTempJobId])
  @@index([sourceJobId])
  @@index([targetJobId])
}
```

Recommended `rowType` values for stored rows:
- `PAIR` — standard source-target swap
- `SOURCE_ONLY` — source position with no trade-off counterpart
- `NOTE` — orphaned target-only or status-only note that doesn't map to a clean pair

Rows that are summary-level (e.g., the row with Dif = -7 and no IDs) are **skipped during import** and not stored. No `SUMMARY_SKIP` rowType is needed.

Reason:
- the sheet has 18 data rows, not 20
- one row is a summary row and should be skipped (not stored)
- one row is an orphaned target-only/status-only note — stored as `NOTE` for auditability

---

## 4. Field Mapping and Normalization

### 4a. Job status

Mapping:

| Excel value | JobStatus |
|---|---|
| `Open` | `OPEN` |
| `Offer` | `OPEN` |
| `Agency` | `OPEN` |
| `Hired` | `CLOSED` |
| `HIred` | `CLOSED` |
| `Hired - CW` | `CLOSED` |
| blank on 2026 sheet | `ON_HOLD` |
| any value on Beyond 2026 sheet | `ON_HOLD` |

Keep the original value in `recruitingStatus`.

### 4b. Priority

Persist the raw Functional Priority string and map the existing enum conservatively:

| Raw value | JobPriority |
|---|---|
| `1` | `CRITICAL` |
| `2` | `HIGH` |
| `3` or `4` | `MEDIUM` |
| everything else | `LOW` |

Notes:
- The workbook contains values like `Business Critical`, `Capacity building`, `Infrastructure / Support`, and mixed strings.
- Unknown values should not be silently normalized into invented categories.
- Log all non-numeric values during import for auditability.

### 4c. isCritical

Use:

```text
isCritical = corporatePriority is non-empty after trim
```

This is acceptable because the existing product meaning already treats `isCritical` as an urgency flag.

### 4d. isTradeoff

Use:

```text
isTradeoff = Tradeoff? column is non-empty after trim and NBSP normalization
```

Do not expect only `Yes`/`x`. The workbook contains freeform notes in this column.

### 4e. Pipeline health

The previous draft was wrong to seed this relative to wall-clock time.

Decision: **persist `pipelineHealth` during import using a pinned date constant.**

```ts
const PIPELINE_HEALTH_AS_OF = new Date('2026-03-17')
```

Rationale: `pipelineHealth` is already a persisted `PipelineHealth?` enum field on Job. The
entire codebase reads it from the DB — dashboard stats queries group by it, the API supports
filtering by it, and Zod validation requires it for OPEN jobs. Computing it at read time would
require removing the persisted field and rewriting every consumer, which is a major refactor
unrelated to the WFP import.

To refresh pipeline health values later, update the constant and re-run the import.

Do **not** compute persisted values from `new Date()` with no fixed reference.

Rules:
- past due or within 14 days -> `BEHIND`
- 15-60 days out -> `ON_TRACK`
- 61+ days out -> `AHEAD`
- null target date on an open job -> `ON_TRACK` only if the existing API contract still requires non-null pipeline health for open jobs

### 4f. Department

Strip numeric prefix:

```regex
/^\d+\s+/
```

Examples:
- `930 Communications` -> `Communications`
- `210 Clinical Operations` -> `Clinical Operations`

Preserve the remainder exactly.

### 4g. Location

Normalize only known variants and log everything else.

Verified raw values include:
- `SSF`
- `PNJ`
- `US Remote`
- `Remote`
- `Chicago`
- `SSF or PNJ`
- `SSF or  PNJ`
- `TBD`
- `EU`
- blank

Recommended mapping:

| Raw | Normalized |
|---|---|
| `SSF` | `South San Francisco, CA` |
| `PNJ` | `Princeton, NJ` |
| `Chicago` | `Chicago, IL` |
| `US Remote` | `Remote (US)` |
| `Remote` | `Remote` |
| `SSF or PNJ` | `South San Francisco / Princeton` |
| `SSF or  PNJ` | `South San Francisco / Princeton` |
| `EU` | `Remote (EU)` |
| `TBD` | `TBD` |

### 4h. Dates

Quarter parsing:

| Raw | openedAt | targetFillDate |
|---|---|---|
| `2026 Q1` | `2026-01-01` | `2026-03-31` |
| `2026 Q2` | `2026-04-01` | `2026-06-30` |
| `2026 Q3` | `2026-07-01` | `2026-09-30` |
| `2026 Q4` | `2026-10-01` | `2026-12-31` |

Rules:
- trim trailing spaces
- `TBD` -> `null`
- blank -> `null`
- for closed roles, `closedAt` may default to `targetFillDate` as an approximation

Budget dates:
- use the Budget tab's exact start date only as a refinement
- do not overwrite a job if matching is ambiguous

### 4i. Description

Keep the original intent, but make the rule explicit:

1. Start with `keyCapability` if it has meaningful content.
2. Append `businessRationale` on a new line if present.
3. If both are too short, use `"{title} -- {function}, {department}"`.
4. Ensure the final value meets the current minimum length contract.

---

## 5. Parsing Plan

### 5a. General sanitization

- trim all strings
- replace `\xa0` with regular spaces
- collapse repeated internal whitespace only where needed for known variants like `SSF or  PNJ`
- treat empty strings as `null` for optional fields
- skip rows with null temp id only when the row is otherwise non-actionable
- skip the two buffer rows where Function contains `BUFFER`

### 5b. WFP Details - 2026

Sheet facts:
- physical rows including header: `346`
- usable jobs after removing header and buffer row: `344`

For each usable row:
- generate `importKey = "WFP Details - 2026:${rowNumber}"`
- set `sourceSheet = "WFP Details - 2026"`
- set `sourceRow = rowNumber`
- map status, priority, and descriptive fields
- preserve all raw text fields
- queue candidate/application extraction where appropriate

### 5c. WFP Details - Beyond 2026

Sheet facts:
- physical rows including header: `296`
- usable jobs after removing header and buffer row: `294`

For each usable row:
- generate `importKey = "WFP Details - Beyond 2026:${rowNumber}"`
- set `horizon = "Beyond 2026"`
- force `status = ON_HOLD`
- keep raw `recruitingStatus` even though it does not drive job status

Important collision cases:
- `5273` appears twice inside this sheet
- `5354` overlaps with a 2026-sheet job

Because of this, any logic keyed only by `tempJobId` is invalid.

### 5d. 2026 Approved Budget

Sheet facts:
- headers on row `7`
- data begins on row `8`
- verified data rows: `511`

For each data row:
- `importKey = "2026 Approved Budget:${rowNumber}"`
- parse `tempJobId` from the leading integer when present
- preserve the raw temp id string in `rawTempJobId`
- parse month values into a JSON object
- parse Excel serial dates into ISO dates
- attempt `matchedJobId` only when exactly one imported job matches the parsed `tempJobId`

Special cases:
- `6000 (5357 Previously)` and `6001 (5358 Previously)` are real rows, not errors
- there are also real jobs `6000` and `6001`
- duplicate Budget rows for `5273` are valid and should remain separate projections

### 5e. Tradeoffs

Sheet facts:
- header row: `1`
- data rows: `18`

Row handling:
- skip the summary row with no ids and `Dif = -7`
- treat standard rows with a source temp id as records
- allow source-only records where target side is blank
- if a row has no source id and no target id but contains target-side text/status, store it as `NOTE` or skip it with an import warning
- do not claim every tradeoff row cleanly maps to a Job relation

### 5f. Candidate and application extraction

Verified extractable patterns:
- `170` rows with `HIRED:`
- `34` rows with `CW:` on `Hired - CW` rows
- `1` row with `Approved at 2025 re-forecast - Vijetha Thokala`
- total extractable hired candidates: `205`
- verified duplicates among those extracted names: `0`

Extraction rules:
- extract only from closed/hired rows
- ignore `CW:` on non-hired rows
- ignore `BACKFILL:` notes
- ignore `Candidate:` notes for now
- for single-name candidates, set `lastName = "(none)"`

Applications:
- stage = `HIRED`
- recruiterOwner = job recruiter
- stageUpdatedAt = `closedAt` if available, else a deterministic fallback tied to the imported job

---

## 6. Import Implementation

### 6a. Seeding strategy

The current build script runs `prisma db seed` during `npm run build`, per [hr-dashboard/package.json](/data/projects/HR_dashboard/hr-dashboard/package.json#L7).

That is too dangerous for a heavyweight workbook importer.

Recommended change before implementation:

1. Keep `prisma/seed.ts` minimal and safe for local/test bootstrap.
2. Move WFP workbook import into an explicit command or gated mode such as:
   - `npm run import:wfp`
   - or `SEED_WFP_DATA=true prisma db seed`
3. Remove the current dummy recruiting dataset from the default seed path.
   - The current `prisma/seed.ts` still inserts dummy jobs, candidates, and applications.
   - The repo must not end up with dummy data plus WFP data in the same environment.
4. Do not make production builds implicitly rewrite application data from the workbook.

Replacement rule:
- the WFP import is the canonical recruiting-data load for environments that use it
- before importing WFP recruiting data into a target database, explicitly clear recruiting entities in FK-safe order:
  - `Tradeoff` (FK to Job via sourceJobId/targetJobId, onDelete: SetNull — won't cascade)
  - `HeadcountProjection` (FK to Job via matchedJobId, onDelete: SetNull — won't cascade)
  - `Application` (FK to Job and Candidate, onDelete: Cascade — but clear explicitly for clarity)
  - `Candidate`
  - `Job`
- do **not** clear `User` or auth-related tables as part of the recruiting-data import
- if preserving existing recruiting records is required later, that becomes a separate migration/import design

### 6b. Dependencies

Add:

```bash
npm install xlsx uuid
```

`@types/uuid` is not needed with current uuid versions.

Add `recharts` only when the chart pages are actually built.

### 6c. ID generation

Use UUID v5 for deterministic imported ids:

```ts
job.id = uuidv5(`job:${importKey}`, WFP_NAMESPACE)
candidate.id = uuidv5(`candidate:${jobImportKey}`, WFP_NAMESPACE)
application.id = uuidv5(`application:${jobImportKey}`, WFP_NAMESPACE)
projection.id = uuidv5(`projection:${projectionImportKey}`, WFP_NAMESPACE)
tradeoff.id = uuidv5(`tradeoff:${tradeoffImportKey}`, WFP_NAMESPACE)
```

Use `importKey`, not `tempJobId`, as the identity input.

### 6d. Database write strategy

Order:

```text
Admin user
Jobs
Candidates
Applications
HeadcountProjections
Tradeoffs
```

Guidelines:
- wrap the entire import in `prisma.$transaction()` with an extended timeout to prevent partial state on failure:
  ```ts
  prisma.$transaction(async (tx) => { ... }, { timeout: 60_000 })
  ```
  The default 5-second timeout is insufficient for ~1576 upserts (638 jobs + 205 candidates + 205 applications + 511 projections + ~17 tradeoffs).
- use deterministic ids so reruns are idempotent
- use `upsert` where identity is stable
- use `createMany` only where the unique key strategy is explicit
- store import warnings for ambiguous matches instead of crashing on every anomaly

### 6e. matchedJobId resolution

After all Jobs are inserted, build an in-memory lookup for matching:

```ts
// Build Map<tempJobId, jobId[]> from all imported jobs
const tempJobIdToJobIds = new Map<number, string[]>()
for (const job of importedJobs) {
  if (job.tempJobId != null) {
    const existing = tempJobIdToJobIds.get(job.tempJobId) ?? []
    existing.push(job.id)
    tempJobIdToJobIds.set(job.tempJobId, existing)
  }
}

// When inserting HeadcountProjection or Tradeoff:
function resolveMatchedJobId(tempJobId: number | null): string | null {
  if (tempJobId == null) return null
  const matches = tempJobIdToJobIds.get(tempJobId)
  if (matches?.length === 1) return matches[0]
  if (matches && matches.length > 1) {
    console.warn(`Ambiguous tempJobId ${tempJobId}: ${matches.length} jobs match`)
  }
  return null
}
```

This resolution happens in-memory between the Jobs insert and the
HeadcountProjection/Tradeoff inserts — no extra DB round-trip needed.

---

## 7. API and UI Changes

### 7a. Jobs API

The previous draft understated this work.

Updating `src/lib/validations/schemas.ts` alone is not enough because:
- `GET /api/jobs` manually parses filters and shapes the response in [route.ts](/data/projects/HR_dashboard/hr-dashboard/src/app/api/jobs/route.ts#L24)
- `GET/PATCH /api/jobs/[id]` manually validates and maps fields in [route.ts](/data/projects/HR_dashboard/hr-dashboard/src/app/api/jobs/[id]/route.ts#L29)

Plan requirement:
- update schemas
- update manual route validation and response mappers
- update query-hook types
- update table/page renderers

New list filters still make sense:
- `employeeType`
- `function`
- `level`
- `horizon`
- `asset`

### 7b. Dashboard metrics

Current logic in [src/lib/dashboard.ts](/data/projects/HR_dashboard/hr-dashboard/src/lib/dashboard.ts#L61) counts distinct candidates attached to open jobs only.

With imported WFP data, that produces `0` active candidates because all 205 extracted
candidates have HIRED-stage applications on CLOSED jobs, and the 30 OPEN jobs have zero
applications.

Decision: **rename the card to "Imported Hires"** and change the query to count candidates
with `HIRED`-stage applications from the imported WFP dataset. This:
- reflects the actual data accurately (`205` hires in this workbook snapshot)
- avoids falsely implying a calendar-year filter the workbook does not cleanly support
- avoids showing a confusing `0` on a dashboard that otherwise shows `638` jobs
- avoids inventing fake pipeline stages from ambiguous notes
- is a minimal code change (one query + one label)

Important:
- do **not** call this metric `"Hired This Year"` unless the implementation also adds a real year filter
- if a year-based metric is desired later, define the date field and filtering rule explicitly first

### 7c. New pages

Do not build all analytics pages in the first implementation pass.

Recommended order:
1. Jobs list and detail pages
2. Tradeoffs page
3. Headcount page
4. Analytics pages only after derived numbers are verified against workbook tabs

---

## 8. Testing Impact

The earlier draft overstated seed-baseline risk for integration tests.

Actual repo behavior:
- integration tests reset DB state before each test in [src/test/setup-integration.ts](/data/projects/HR_dashboard/hr-dashboard/src/test/setup-integration.ts#L63)
- E2E tests use custom seed helpers in [__tests__/e2e/utils/database.ts](/data/projects/HR_dashboard/hr-dashboard/__tests__/e2e/utils/database.ts#L215)

Real test risks:
- Prisma schema changes breaking factories
- new non-null fields breaking helper-created rows
- route response shape changes breaking API tests
- jobs/candidates pages rendering more metadata than the current fixtures provide

Recommended test strategy:
- keep integration tests factory-based and isolated
- keep E2E fixtures explicit and small
- do not make E2E depend on the WFP workbook import unless a specific suite is created for it
- add dedicated importer tests that verify row counts and anomaly handling

---

## 9. Execution Order

### Phase 0: De-risk the import strategy

1. Decide whether WFP import is a separate command or a gated seed mode.
2. Stop treating `tempJobId` as unique.
3. Add provenance fields and deterministic `importKey`.

### Phase 1: Schema

4. Update `schema.prisma` for:
   - Job provenance fields
   - non-unique `tempJobId`
   - HeadcountProjection with optional `matchedJobId`
   - Tradeoff with row-level import identity
5. Create and apply a migration: `npx prisma migrate dev --name add-wfp-import-fields`

### Phase 2: Importer

6. Rewrite the importer around workbook parsing and deterministic ids.
7. Add import diagnostics for:
   - duplicate `tempJobId`
   - ambiguous job matches
   - orphan tradeoff rows
   - unknown location / priority / tradeoff values
8. Verify imported counts against the workbook.

### Phase 3: Existing surfaces

9. Update job validation schemas.
10. Update `/api/jobs`.
11. Update `/api/jobs/[id]`.
12. Update jobs list UI.
13. Update job detail UI.
14. Decide and implement dashboard metric behavior.

### Phase 4: Secondary views

15. Add tradeoffs API/page.
16. Add headcount API/page.
17. Only then begin derived analytics pages.

### Phase 5: Verification

18. Run:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run test:integration
npm run build
```

19. Run the explicit WFP import path against a disposable database and verify the imported counts there:

```bash
# Example shape; final command name/env gate may vary
npm run import:wfp
```

20. Confirm the verification checklist against that disposable database before treating the import as complete.

21. Run E2E only after the job pages remain stable:

```bash
npm run test:e2e
```

---

## 10. Verification Checklist

After import, verify:

### Jobs

- total imported jobs = `638`
- 2026 imported jobs = `344`
- Beyond 2026 imported jobs = `294`
- `OPEN = 30`
- `CLOSED = 205`
- `ON_HOLD = 403`

### Candidates and applications

- imported candidates = `205`
- imported applications = `205`
- no duplicate extracted candidate names in this workbook snapshot
- no empty-string last names

### Budget

- projections = `511`
- duplicate raw temp id `5273` is preserved as two rows
- parenthetical raw ids are preserved
- `matchedJobId` is only set when matching is unambiguous

### Tradeoffs

- total parsed source sheet rows after header = `18`
- summary row skipped = `1`
- any orphan note rows are either preserved as `NOTE` or logged and skipped intentionally

### Data quality

- every imported job has `importKey`, `sourceSheet`, and `sourceRow`
- every imported id is a valid UUID
- all unknown normalizations are logged

---

## 11. Risks and Mitigations

### Build-time data mutation

Risk:
- `npm run build` currently seeds data automatically

Mitigation:
- separate or gate the WFP importer before implementation begins

### Mixed dummy and WFP data

Risk:
- decoupling the WFP import from the default seed path can leave the existing dummy recruiting dataset in place
- importing WFP data on top of dummy data will break counts, dashboards, and verification

Mitigation:
- explicitly remove dummy recruiting seed data from the default path
- define a clear replacement step for recruiting entities before WFP import
- verify post-import counts only on a database that has gone through that replacement flow

### Ambiguous external-sheet matching

Risk:
- budget/tradeoff rows may point to multiple jobs with the same `tempJobId`

Mitigation:
- store raw ids
- only set `matchedJobId` on unambiguous matches
- emit warnings for the rest

### Over-scoped delivery

Risk:
- importer + schema + dashboard + six analytics pages is too much in one pass

Mitigation:
- land importer correctness first
- land existing-surface updates second
- defer analytics until derived numbers are proven
