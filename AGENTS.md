# AGENTS.md

## Project context

This repository contains a BSc thesis project titled **Adattárolás a felhőben**.

The goal is to build CloudVault, a product-quality, AI-assisted web application where users can upload, view, download, manage, delete, restore and share images/videos stored in cloud object storage. Its central SZD2 engineering contribution is resumable batch media import with extensible, restart-safe background processing.

For CloudVault planning, implementation, review and thesis work, read the project skill at [`SKILL.md`](SKILL.md). It records the October supervisor requirements, evidence workflow and unresolved scheduling questions. Keep project-wide engineering rules here; keep the supervisor-specific workflow in the skill.

Before implementing anything, read and respect:

- `docs/plan.md`
- `docs/milestones.md`
- `README.md`, if it already exists
- relevant files under `docs/`

If `docs/plan.md` or `docs/milestones.md` conflicts with a user instruction, follow the user's latest explicit instruction and mention the conflict.

### October 2026 requirements baseline

The October supervisor feedback adds resumable batch import, thumbnail and image-metadata processors, durable processing state, recovery and comparative measurements to the required target. These are planned requirements, not implemented capabilities or permission to implement them during a documentation task.

The current `docs/plan.md` and `docs/milestones.md` reflect this baseline and list the remaining targeted contract updates. Detailed product/design documents, C4 views and ADRs still contain July assumptions until those updates are completed. In particular, single-PUT-only upload and deferred thumbnail generation are outdated scope assumptions. Use the October plan for requirement conflicts and update affected contracts before the relevant implementation; preserve still-valid security and accounting invariants.

---

## Working language

- Communicate with the thesis author in Hungarian unless they ask otherwise.
- Keep code identifiers, file names, class names, functions, variables, commits and package names in English.
- Technical documentation may be in Hungarian because the thesis is Hungarian.
- Do not translate library/framework concepts unnecessarily.

---

## Fixed technology stack

Use the following stack unless the user explicitly changes it.

### Frontend

- Vue 3
- Vite
- TypeScript
- Tailwind CSS
- Vue Router
- Pinia only if shared/global frontend state is needed

### Backend

- Node.js
- TypeScript
- NestJS
- Prisma ORM
- PostgreSQL

### Object storage

- Local development: MinIO
- Cloud-compatible target: AWS S3 or OCI Object Storage through S3-compatible APIs
- Use an internal storage adapter abstraction so the application is not tightly coupled to one provider.

### Testing

Initial phase:

- Unit tests only.
- Backend: Jest.
- Frontend: Vitest if frontend logic needs tests.

Later phases, only when explicitly requested:

- integration tests
- e2e tests
- contract tests
- CI/CD pipeline

Do not introduce CI/CD, integration tests or e2e tests unless the user asks for them or a milestone explicitly says to start that phase.

Unit-first is a development phase, not the final submission standard. SZD2 requires evidence for component cooperation, complete user flows, recovery and user acceptance. Plan an explicit quality phase for appropriate integration/e2e/contract checks and CI; implementation still follows the authorization rule above. The older v1.2 rubric includes test-count/mix and CI criteria, while the newer Coospace guidance emphasizes meaningful results. Keep their final applicability as an explicit clarification item rather than silently dropping them or declaring unit-only completion sufficient.

---

## Repository structure

Prefer this monorepo structure:

```text
/
  README.md
  AGENTS.md
  SKILL.md
  docs/plan.md
  docs/milestones.md
  .gitignore
  .env.example

  frontend/
    package.json
    src/
    tests/

  backend/
    package.json
    prisma/
    src/
    test/

  docs/
    00_index.md

    01_product/
      vision.md
      scope_contract.md
      capability_map.md
      metrics.md
      ux_flows.md

    02_architecture/
      c4_context.md
      c4_container.md
      c4_component.md
      quality_attributes.md
      adr/

    03_design/
      api.md
      data_model.md
      error_handling.md
      traceability.md

    04_quality/
      test_strategy.md
      test_report.md

    05_security_ops/
      threat_model.md
      privacy_licensing.md
      deploy_runbook.md
      runbook.md
      observability.md

    06_release/
      demo_script.md
      release_notes.md
      self_assessment.md

    07_ai/
      ai_manifest.md
      prompt_log.md
      verification_log.md

    assets/
      screenshots/
      diagrams/
```

Do not scatter official thesis documentation outside `docs/` unless the user explicitly asks.

---

## General working rules

For every non-trivial task:

1. Inspect the relevant files first.
2. Summarize the intended change briefly.
3. Implement the smallest useful change.
4. Add or update unit tests if code behavior changes.
5. Update documentation if behavior, architecture, API, data model or security assumptions change.
6. Mention what was changed and what should be manually reviewed.
7. Do not silently expand the scope.

If the user asks for planning, documentation or review, do not start implementation.

If the user asks for implementation, avoid large uncontrolled rewrites. Prefer milestone-sized or feature-sized changes.

---

## Scope discipline

The MVP should focus on:

- user registration
- user login
- protected frontend
- file upload to MinIO through a backend-controlled flow, with presigned storage access and an explicitly designed resumable-transfer extension
- pending upload reservation, idempotent confirmation and abandoned-upload cleanup
- file metadata saved in PostgreSQL
- cursor-paginated listing of the user's own files
- image/video preview
- file download
- soft delete
- restore during the retention window
- storage usage display
- basic sharing link
- backend validation
- basic audit events without an audit UI
- unit tests
- core documentation

Required SZD2 depth alongside the complete application:

- batch import with stable operation identity, per-file progress and isolated failures
- interrupted transfer resumed from already received data, without re-uploading completed files
- retry-safe import, confirmation and accounting without duplicate files or charges
- two built-in image processors: thumbnail generation and image-metadata extraction
- a shared processor interface, identifiable processor versions and independent retry
- durable job/results state and recovery after worker restart without duplicate outputs
- consistent ownership, quota and lifecycle rules for originals and derived objects
- comparative restart-from-zero versus resumable-upload measurements and documented user trials

The exact transfer mechanism is not selected. The supervisor suggests investigating Uppy/tus; do not mandate it or add a dependency without a concrete decision. Backend authorization remains mandatory for every upload/continuation operation, whether using presigned object-storage requests or an approved resumable-transfer service.

Optional post-core `MVP+` scope:

- AI-assisted metadata suggestions for active images only
- explicit user trigger and human accept/edit/reject
- provider adapter and graceful failure independent from core storage

The product AI feature is distinct from AI-assisted development. Do not implement it before the Core MVP is stable and the user explicitly requests the `MVP+` phase. Face recognition, biometric identification and sensitive-attribute inference are prohibited, not later-stage goals.

Keep these as later-stage or stretch goals unless explicitly requested:

- full cloud deployment
- CI/CD
- integration tests
- e2e tests
- large-video multipart upload beyond the required resumable image-import scope
- video transcoding
- admin interface
- advanced monitoring dashboard
- offline import preparation and persistent browser storage of large videos
- user-supplied plugins or a plugin marketplace

Large-video multipart support remains later scope; a mechanism needed for the required resumable image import must be evaluated separately rather than deferred under that label.

---

## Architecture rules

### Frontend must not directly own storage access

The frontend must not store S3/MinIO credentials.

The frontend should request backend-controlled operations:

- create upload request
- receive short-lived presigned upload access or an authorized resumable session, according to the selected transfer ADR
- resume, retry or cancel an import/file transfer with backend authorization
- confirm upload
- request short-lived preview/download URL
- create share links

Share-link revocation as a user-facing feature is later scope. Core soft delete permanently invalidates existing links; restore requires a new link.

The backend must enforce authorization and ownership checks.

### Store binary data and metadata separately

Use object storage for binary file contents.

Use PostgreSQL for metadata, ownership, file status, share links, audit events and storage usage.

### Use a storage adapter

Do not scatter direct S3/MinIO SDK calls throughout the codebase.

Prefer a backend storage module/adapter such as:

```text
storage/
  storage.module.ts
  storage.service.ts
  storage.interface.ts
  s3-storage.adapter.ts
```

The adapter should hide provider-specific details where practical.

---

## Backend design rules

Use NestJS modules with clear boundaries.

Suggested backend modules:

```text
backend/src/
  app.module.ts

  config/
  common/
    errors/
    guards/
    decorators/
    utils/

  auth/
  users/
  files/
  imports/      # planned batch/session orchestration
  processing/   # planned built-in processors and durable jobs
  storage/
  sharing/
  audit/
  ai-metadata/  # optional MVP+ only
  health/
```

Rules:

- Use DTOs for request validation.
- Use `class-validator` / `class-transformer` if the project already uses them.
- Use Prisma for database access.
- Keep business logic in services, not controllers.
- Keep controllers thin.
- Do not access `process.env` all over the codebase; centralize configuration.
- Use consistent error objects.
- Do not return stack traces or internal error details to the frontend.
- Avoid logging PII, tokens, credentials or file contents.

---

## Frontend design rules

Use Vue 3 Composition API.

Suggested frontend structure:

```text
frontend/src/
  main.ts
  App.vue

  router/
  stores/
  api/
  components/
  pages/
  layouts/
  types/
  utils/
```

Rules:

- Keep API calls in a dedicated API client layer.
- Do not hardcode backend URLs; use environment variables.
- Do not store long-lived sensitive data in localStorage unless explicitly decided and documented.
- Use reusable components for file cards, upload UI, storage usage card, empty states, error alerts and loading states.
- Show user-friendly error messages.
- Include empty/loading/error states for important screens.

---

## Data model guidance

Initial entities should include:

### User

Suggested fields:

- `id`
- `email`
- `passwordHash`
- `displayName`
- `usedStorageBytes`
- `reservedStorageBytes`
- `storageLimitBytes`
- `createdAt`
- `updatedAt`

### FileObject

Suggested fields:

- `id`
- `ownerId`
- `originalName`
- `storageKey`
- `mimeType`
- `detectedMimeType`
- `sizeBytes`
- `checksum`
- `visibility`
- `status`
- `uploadUrlExpiresAt`
- `confirmBy`
- `deletedAt`
- `purgeAfter`
- `createdAt`
- `updatedAt`

### ShareLink

Suggested fields:

- `id`
- `fileObjectId`
- `tokenHash`
- `createdByUserId`
- `expiresAt`
- `maxAccessCount`
- `accessCount`
- `revokedAt`
- `createdAt`

Only token hash, expiry and ownership fields are Core MVP requirements. Revocation, access counts and access limits remain later scope.

### AuditEvent

Suggested fields:

- `id`
- `actorUserId`
- `action`
- `resourceType`
- `resourceId`
- `metadata`
- `createdAt`

### AiMetadataSuggestion

Optional `MVP+` fields:

- `id`
- `fileObjectId`
- `requestedByUserId`
- `status`
- `suggestedTags`
- `suggestedDescription`
- `providerKey`
- `modelKey`
- `decidedAt`
- `createdAt`
- `updatedAt`

Keep `docs/03_design/data_model.md` synchronized with the Prisma schema.

Before implementing resumable import and processing, extend the model contract with durable import/file transfer identity, processing jobs, processor versions and derived results. Define uniqueness and state-transition rules that prevent repeated operations from creating duplicate files, previews or quota changes. These are required concepts; exact entity names and queue technology remain design decisions.

---

## Storage behavior rules

### Upload flow

The following is the original single-upload baseline for validation and accounting. It is not by itself the final resumable batch contract:

1. Frontend sends upload metadata to backend.
2. Backend validates user, file name, size, MIME type and `used + reserved + requested` storage quota.
3. Backend transactionally creates a `PENDING_UPLOAD` `FileObject` and increases `reservedStorageBytes`.
4. Backend generates a short-lived presigned upload URL, 5 minutes by default.
5. Frontend uploads file to MinIO/S3.
6. Frontend calls confirm endpoint.
7. Backend verifies the object with `HEAD` and a bounded range read for magic-number detection.
8. Backend idempotently changes `PENDING_UPLOAD` to `ACTIVE`, decreases the reservation and increases `usedStorageBytes` exactly once.
9. A pending upload expires after 15 minutes by default. Missing or successfully deleted abandoned objects release the reservation; cleanup failures retain it for retry.

For resumable imports, persist progress and operation identity, isolate each file's failure and bound concurrent transfers. Define resume, retry, cancel and cleanup behavior in the API/model and ADR before implementation. The original 5-minute URL and 15-minute pending deadlines are baseline defaults: explicitly reconcile credential renewal, session expiry and reservation retention with resumable sessions. An idempotent confirm alone does not satisfy resumable transfer or import-level idempotency.

### Background processing

- Start processing only after upload completion and content validation.
- Use a common interface for the thumbnail and image-metadata processors; record which processor version produced each result.
- Treat unavailable image metadata as a valid result, with an explicit absence representation.
- Persist jobs and results so restart can recover unfinished work; repeat delivery must not duplicate results or storage charges.
- Retry failed steps independently. Keep the original and successful sibling results usable.
- Enforce owner boundaries and define derived-object quota, soft-delete/restore and cleanup behavior.
- Treat extracted metadata as untrusted and potentially private; do not expose or log unnecessary location or other personal data.
- Use a simple worker with the existing application, database and object storage. Do not introduce a distributed platform or queue dependency without a justified decision and the applicable approval.

### Download/preview flow

- Backend must check ownership or share-link validity.
- Backend generates short-lived presigned read URL.
- Backend should control response behavior such as `Content-Disposition`.
- Dangerous content must not be served inline.

### Sharing flow

Prefer backend-controlled share links.

A public share link should not be a long-lived raw S3 URL. The backend should validate the share token and then generate a short-lived read URL.

The Core MVP share token is 32 cryptographically random bytes encoded as base64url. Store only its SHA-256 hash and require an expiry between 1 hour and 7 days. Soft delete removes existing share-link records so restore cannot unexpectedly reactivate old public access.

---

## Soft delete and purge rules

Do not immediately hard-delete files when the user deletes them.

Use soft delete:

- set `deletedAt`
- set `purgeAfter`
- hide the file from normal file lists
- allow restore during the retention window

Recommended retention window: 30 days.

A later purge process should permanently remove:

- the object from MinIO/S3
- the database record, or mark it as permanently purged
- the corresponding `usedStorageBytes`

If implementing purge:

- make it idempotent
- handle partial failures
- document the behavior in ADR and runbook
- unit test the core purge selection and accounting logic

---

## Storage usage rules

Do not repeatedly calculate dashboard usage with `SUM(sizeBytes)` on every request as the main design.

Use denormalized `User.usedStorageBytes` and `User.reservedStorageBytes` fields.

Rules:

- Increase `usedStorageBytes` only after successful finalized upload.
- Do not increase `usedStorageBytes` for failed or abandoned uploads.
- Increase `reservedStorageBytes` during upload init in the same transaction that creates the pending record.
- Transfer the same size from reserved to used exactly once during successful confirm.
- Release a reservation only after object absence or successful invalid/abandoned object cleanup is verified.
- Keep the reservation when cleanup fails, so orphaned objects cannot bypass quota.
- Soft-deleted files still count as used storage while the binary object still exists.
- Decrease it only after permanent purge.
- Unit test this accounting logic.

Extend these original-file invariants with a documented quota policy for derived previews, partial transfers and retries before implementing processing. A derived object must not be an unaccounted storage bypass. Define reservation, finalization and cleanup for derived bytes; soft delete and restore must preserve the chosen accounting policy. Failed jobs and duplicate delivery must not create duplicate usage charges.

Document the decision in an ADR.

---

## File validation and security rules

Do not trust:

- file extension
- browser-provided MIME type
- frontend-provided metadata

Validate uploaded files using a combination of:

- file size limit
- allowlisted MIME types
- magic number detection with a library such as `file-type`
- safe filename normalization
- ownership and authorization checks

Treat these as risky unless explicitly handled:

- HTML
- SVG
- JavaScript
- XML
- unknown binary types

For previews/downloads:

- use safe `Content-Disposition`
- avoid rendering dangerous content inline
- keep presigned URLs short-lived

Add security-related unit tests when implementing validation or authorization logic.

---

## Resumable transfer and multipart upload rule

True resumable batch image upload is a required SZD2 target. A file picker, whole-file retry or idempotent confirm does not meet it.

Evaluate an existing transfer mechanism, including the supervisor's Uppy/tus suggestion, against the S3-compatible storage adapter, authentication, quotas, restart recovery and measured retransmission. Do not invent a custom transfer protocol. tus and S3 multipart are distinct mechanisms; neither is automatically selected by this requirement.

Record the decision and a focused proof of concept before substantial implementation. If S3 multipart is selected, document initiate, presign-parts, complete, abort, expiry, partial-data cleanup and retry behavior. Revisit ADR-009 explicitly; do not silently preserve its single-PUT-only assumption or replace the storage architecture.

Large-video multipart support remains a later extension. Implementing multipart or adding a major transfer dependency requires the applicable user authorization; this guidance update alone does not provide it.

---

## API documentation rules

If backend API exists, keep `docs/03_design/api.md` updated.

API documentation should include:

- base URL
- API versioning idea, if used
- auth mechanism
- endpoint list
- request examples
- response examples
- error examples
- authorization rules
- relevant rate limit or abuse-prevention notes

Do not document endpoints that do not exist unless clearly marked as planned.

---

## Error handling rules

Use a consistent backend error shape.

Suggested shape:

```json
{
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "The selected file is too large.",
    "details": {},
    "requestId": "..."
  }
}
```

Rules:

- User-facing messages should be understandable.
- Internal details should be logged but not returned.
- Do not leak stack traces.
- Do not leak tokens, credentials or PII.
- Document major error categories in `docs/03_design/error_handling.md`.

---

## Testing rules

Initial focus: unit tests.

Prioritize tests for:

- password hashing/checking
- auth validation
- ownership checks
- storage key generation
- file size validation
- MIME/magic number validation
- storage quota accounting
- concurrent quota reservation and idempotent upload confirmation
- abandoned upload cleanup and retry behavior
- import-level idempotency, resumable progress and per-file failure isolation
- processor version/result identity, independent retry and worker-restart recovery
- original/derived-object quota accounting and duplicate-job protection
- deterministic cursor pagination
- soft delete/restore
- purge selection logic
- share link token hashing and expiry
- share-link invalidation on soft delete and non-reactivation on restore
- optional AI suggestion state/failure isolation only in the approved MVP+ phase
- error mapping

Do not introduce integration/e2e tests in the early phase unless asked.

When adding logic, prefer pure functions or isolated services that are easy to unit test.

Keep `docs/04_quality/test_strategy.md` and `docs/04_quality/test_report.md` updated when test strategy or results change.

For SZD2 evidence, compare resumable and restart-from-zero transfers under identical inputs and conditions, including controlled network interruptions, worker restart and a corrupt image. Use small and larger non-sensitive image batches (the supervisor suggests 10 and 50 files). Record correct file/result counts, retransmitted bytes and completion time; verify actual database/object-storage outcomes, not only UI success indicators.

Every test or experiment report must identify the version, date, environment, inputs, steps, expected/actual outcome and evidence. Document actual user trials, feedback, fixes and retests; do not call a developer's own manual check external UAT.

---

## Documentation rules

This is a thesis project, so documentation is part of the product.

Keep documentation concise, accurate and synchronized with the implementation.

Important docs:

- `README.md`: quickstart, stack, run/test commands
- `docs/01_product/vision.md`: product vision
- `docs/01_product/scope_contract.md`: MVP, non-goals, acceptance criteria
- `docs/01_product/capability_map.md`: value/productization capabilities
- `docs/01_product/ux_flows.md`: 3 core flows and the optional MVP+ AI flow
- `docs/02_architecture/c4_context.md`: C4 context diagram
- `docs/02_architecture/c4_container.md`: C4 container diagram
- `docs/02_architecture/quality_attributes.md`: quality attributes
- `docs/02_architecture/adr/`: ADRs
- `docs/03_design/api.md`: API contract
- `docs/03_design/data_model.md`: data model
- `docs/03_design/error_handling.md`: error model
- `docs/03_design/traceability.md`: pillars, stories, interfaces, entities and planned test groups
- `docs/04_quality/test_strategy.md`: test approach
- `docs/04_quality/test_report.md`: latest test state
- `docs/05_security_ops/threat_model.md`: threats and mitigations
- `docs/05_security_ops/privacy_licensing.md`: privacy and third-party dependencies
- `docs/05_security_ops/runbook.md`: incident scenarios
- `docs/05_security_ops/observability.md`: health, logs, metrics
- `docs/07_ai/ai_manifest.md`: AI usage
- `docs/07_ai/prompt_log.md`: important prompts
- `docs/07_ai/verification_log.md`: how AI outputs were verified

Do not write documentation that claims functionality exists if it is not implemented. Mark future items as planned or later phase.

Write the thesis alongside development. Use the sample thesis as a content/illustration example, not a mandatory format or substitute for current test/UAT/deployment requirements. Include numbered, titled real screenshots with textual references and explanations; remove sensitive data. Keep the final application, documentation, screenshots, test evidence and reviewed thesis PDF aligned to an identifiable version. A tested local deployment is acceptable; paid cloud infrastructure is not inherently required. Follow KISS/LEAN: maintain useful existing documents instead of creating empty templates for each topic.

---

## ADR rules

Create or update an ADR for major decisions.

Minimum ADR structure:

```md
# ADR-XXX: Title

## Status

Proposed | Accepted | Deprecated

## Context

What problem are we solving? What constraints exist?

## Decision

What did we choose?

## Alternatives considered

What else was considered?

## Consequences

Positive and negative consequences.

## Verification

How will this decision be checked? Test, PoC, benchmark, code review, or documented experiment.
```

ADR candidates for this project:

- frontend framework
- backend framework
- PostgreSQL + Prisma
- MinIO/S3-compatible object storage
- backend-controlled presigned URL flow
- soft delete + delayed purge
- denormalized storage usage counter
- magic number file validation
- large-video multipart as a later phase, distinct from the required resumable image import
- authentication approach
- idempotent upload confirmation and pending quota reservation
- optional human-in-the-loop AI metadata suggestions
- resumable transfer selection and batch/import idempotency
- shared processor interface, durable jobs, versioned results and restart recovery
- derived-object quota and lifecycle policy

---

## AI documentation rules

Keep these concepts separate:

- AI-assisted development is documented in `docs/07_ai/`.
- The optional product AI metadata suggestion is an `MVP+` application capability governed by product, architecture, privacy and test documentation.

No product AI provider, model, dependency or queue is approved by documentation alone. Implementation requires explicit user authorization and provider privacy/licensing review.

For non-trivial AI-assisted work, suggest or update entries in:

- `docs/07_ai/prompt_log.md`
- `docs/07_ai/verification_log.md`

Prompt log entry should capture:

- date or iteration id
- goal
- prompt summary
- AI output summary
- affected files
- manual modifications

Verification log entry should capture:

- AI claim or generated solution
- risk if wrong
- verification method
- result
- conclusion or change made

If an AI-generated suggestion is wrong, document it. This is not a failure; it shows engineering maturity.

Never include secrets, tokens, real personal data or private credentials in prompt logs.

---

## Security and privacy rules

Never commit secrets.

Do not commit:

- API keys
- access tokens
- cloud credentials
- database passwords
- JWT secrets
- real personal data
- private files

Use `.env.example` to document required variables.

Use environment variables for configuration.

Do not log:

- passwords
- password hashes
- JWT tokens
- presigned URLs if they grant access
- file contents
- unnecessary personal data

Backend authorization is mandatory for protected resources.

Frontend-only authorization is not enough.

---

## Local development rules

Local development should use:

- PostgreSQL through Docker Compose
- MinIO through Docker Compose
- NestJS backend dev server
- Vite frontend dev server

Do not require real AWS or OCI credentials for normal local development.

The README should eventually allow a reviewer to start the app within a reasonable time using documented commands.

---

## Execution environment

- On the thesis author's current machine, the repository is on the Windows filesystem, mounted in WSL at `/mnt/c/Users/ngy-m/Desktop/szakdolgozat/adattarolas-a-felhoben`. Codex executes commands in **WSL Bash**. This is a local-machine example, not a required checkout path; use the actual working directory or `git rev-parse --show-toplevel` for other checkouts/worktrees.
- Use Linux `node` and `npm` inside WSL (currently `/usr/bin/node` and `/usr/bin/npm`), not Windows `node.exe`/`npm.cmd`. Follow `.nvmrc` and the package engines; verified baseline: Node 22.23.2 and npm 10.9.8. If tool resolution changes, inspect `command -v node` and `command -v npm` before installing anything.
- Run workspace commands from the repository root. Use the single root `package-lock.json`; do not install separately in `backend/` or `frontend/`, mix Windows and Linux `node_modules`, or reinstall dependencies on every task.
- Installation, module loading, tests and builds on `/mnt/c` can take several minutes. Keep running commands in their existing sessions and inspect their output; silence alone is not a failure or a reason to start a duplicate install/test/build. Do not move the checkout or change global WSL/Docker settings without a user request.
- Docker Desktop must be running with Linux containers. Check `docker version` for a reachable Server, not just `command -v docker`: on this machine the WSL `docker` shim existed but Docker integration was unavailable during the foundation verification.
- If normal WSL Docker integration works, use the root `infra:*` scripts. Otherwise the verified Windows CLI fallback is `/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe`; quote the path and run it from the repository root. Check that it exists on the current machine before using it. Equivalent commands are below; they read the same root `.env` and Compose file:

```bash
docker_cli='/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe'
"$docker_cli" compose up -d --build --wait postgres minio
"$docker_cli" compose run --build --rm minio-init
"$docker_cli" compose ps -a
# Stop only when needed; named volumes are preserved.
"$docker_cli" compose down
```

Do not assume an earlier session's temporary `/tmp` Docker wrapper still exists. If the Windows CLI is also unavailable, report the concrete prerequisite instead of repeatedly searching or reinstalling Docker. Never print the fully resolved Compose configuration or `.env`, since they contain credentials; use `compose config --quiet` for validation.

---

## Commands

The primary full local startup uses root `docker-compose.yaml`: first `node scripts/init-env.mjs`, then `docker compose up -d --build --wait`. This builds and starts frontend/backend/PostgreSQL/MinIO, applies committed migrations through `db-migrate` and initializes storage through `minio-init`. Use `docker compose ps -a`, `docker compose logs --tail=100 <service>` and `docker compose down`; never add `-v` for routine shutdown. The Windows Docker CLI fallback above can run the same full startup command. Full container startup still requires a reachable Docker Server; config validation alone is not runtime evidence.

The backend bind address is centrally validated as `BACKEND_HOST` (default `127.0.0.1` for host development, `0.0.0.0` inside Compose). Only public `VITE_API_BASE_URL` is passed to frontend builds. Root `.env` must never enter image build context. Container startup rewrites only the host/port of `DATABASE_URL`, preserving encoded credentials and database settings. Changes to this helper are checked with `npm run test:container`.

The npm commands below are the optional host development/verification workflow, not prerequisites for full Compose startup. Stop full application containers before starting host dev servers on the same ports.

Before running commands, inspect the relevant `package.json` files. These root scripts exist in the technical foundation; keep this list synchronized when scripts change. The Quickstart and prerequisites are in [README.md](README.md).

```bash
# First setup, or reinstall only when justified by dependency/lockfile changes.
npm ci
npm run env:init
npm run infra:up
npm run db:generate
npm run db:migrate

# Separate terminals, both started from the repository root.
npm run dev:backend
npm run dev:frontend

# Verification; unit tests do not require PostgreSQL or MinIO.
npm run db:validate
npm run typecheck
npm test  # Includes container configuration helper tests and both workspaces.
npm run build

# Local infrastructure status / non-destructive shutdown, when needed.
npm run infra:status
npm run infra:down
```

The command groups above are alternatives for the task at hand, not a script to run unconditionally in full. Use the Docker fallback above for `infra:*` operations if WSL integration is unavailable. Build/typecheck generate Prisma Client automatically; Prisma CLI commands need the local `.env`. `env:init` preserves existing credentials. Never reset database volumes to fix a routine setup problem.

For targeted checks, use `npm run test --workspace backend` or `npm run test --workspace frontend`. For a new development migration use `npm run db:migrate:dev -- --name <name>`; normal setup applies committed migrations with `npm run db:migrate`. Do not invent scripts that do not exist.

---

## Git and commit rules

Use Conventional Commits:

- `feat:` for features
- `fix:` for bug fixes
- `docs:` for documentation
- `test:` for tests
- `refactor:` for refactoring
- `chore:` for setup/tooling
- `ci:` for CI changes, but CI is later phase

Keep commits focused.

Do not commit generated build outputs unless intentionally required.

Do not commit `.env`.

### Branch strategy

Follow the BSc branch strategy defined by the thesis tooling guide:

- `main` contains only stable, submission-ready changes.
- Do not commit implementation or documentation changes directly to `main`.
- Use `feature/<short-kebab-case-scope>` for features.
- Use `fix/<short-kebab-case-scope>` for bug fixes.
- Use `docs/<short-kebab-case-scope>` for documentation-only work.
- Open a pull request / merge request from the working branch to `main`.
- Before CI is introduced in the dedicated later milestone, merge only after PR review and documented manual verification.
- After CI is introduced, merge to `main` only after review and after all required CI checks are green.
- A separate `develop` branch is not required for this BSc project.
- AI-assisted work uses the same branch names; record the AI contribution in `docs/07_ai/` instead of encoding it in the branch name.

Existing historical commit messages and branch names do not need to be rewritten. Apply this strategy and Conventional Commits to new work from now on.

---

## Definition of Done

A task is done only when:

- the requested behavior is implemented or the requested document is created
- relevant unit tests are added or updated, if code behavior changed
- relevant docs are updated, if behavior/design changed
- no secrets are introduced
- formatting and type errors are not knowingly introduced
- important AI-generated assumptions are verified or marked for verification
- the final response clearly states what changed and what remains to be reviewed

---

## When to ask before proceeding

Ask for confirmation before:

- changing the chosen technology stack
- adding CI/CD
- adding integration/e2e tests
- introducing a new major dependency
- changing the database choice
- changing authentication strategy after an ADR exists
- implementing multipart upload
- implementing cloud deployment
- deleting or rewriting large parts of the project

## Subagent usage rules

Use subagents proactively for complex or parallelizable tasks, especially when the task involves review, planning, architecture, security, tests or documentation consistency.

Prefer subagents for:

- architecture review
- security review
- backend implementation review
- frontend implementation review
- test strategy review
- documentation consistency review
- ADR review
- AI verification review

When using subagents, split the work by responsibility instead of asking every agent to do the same thing.

Recommended subagent roles:

- `architecture-reviewer`: checks architecture, ADRs, C4 diagrams and tradeoffs
- `security-reviewer`: checks auth, authorization, secrets, file validation, XSS and privacy risks
- `backend-reviewer`: checks NestJS, Prisma, PostgreSQL and storage adapter logic
- `frontend-reviewer`: checks Vue, TypeScript, Tailwind, UX states and API usage
- `test-reviewer`: checks unit test coverage, edge cases and missing tests
- `docs-reviewer`: checks README, docs, ADRs, prompt log and verification log consistency

For large changes, ask subagents to inspect independently, then consolidate their findings into one prioritized summary.

Do not spawn subagents for small, simple edits such as typo fixes or a single small function.

Because subagents consume more tokens, use them when the expected quality gain is worth the cost.
