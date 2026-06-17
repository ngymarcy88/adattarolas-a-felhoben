# AGENTS.md

## Project context

This repository contains a BSc thesis project titled **Adattárolás a felhőben**.

The goal is to build a product-quality, AI-assisted web application where users can upload, view, download, manage, delete, restore and share images/videos stored in cloud object storage.

Before implementing anything, read and respect:

- `plan_final.md`
- `milestones.md`
- `README.md`, if it already exists
- relevant files under `docs/`

If `plan_final.md` or `milestones.md` conflicts with a user instruction, follow the user's latest explicit instruction and mention the conflict.

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

---

## Repository structure

Prefer this monorepo structure:

```text
/
  README.md
  AGENTS.md
  plan_final.md
  milestones.md
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
- file upload to MinIO through backend-controlled presigned URL flow
- file metadata saved in PostgreSQL
- listing the user's own files
- image/video preview
- file download
- soft delete
- storage usage display
- basic sharing link
- backend validation
- unit tests
- core documentation

Keep these as later-stage or stretch goals unless explicitly requested:

- full cloud deployment
- CI/CD
- integration tests
- e2e tests
- full multipart upload implementation
- thumbnail generation
- video transcoding
- admin interface
- advanced monitoring dashboard

---

## Architecture rules

### Frontend must not directly own storage access

The frontend must not store S3/MinIO credentials.

The frontend should request backend-controlled operations:

- create upload request
- receive short-lived presigned upload URL
- confirm upload
- request short-lived preview/download URL
- create/revoke share links

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
  storage/
  sharing/
  audit/
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
- `deletedAt`
- `purgeAfter`
- `createdAt`
- `updatedAt`

### ShareLink

Suggested fields:

- `id`
- `fileObjectId`
- `token`
- `expiresAt`
- `maxAccessCount`
- `accessCount`
- `revokedAt`
- `createdAt`

### AuditEvent

Suggested fields:

- `id`
- `actorUserId`
- `action`
- `resourceType`
- `resourceId`
- `metadata`
- `createdAt`

Keep `docs/03_design/data_model.md` synchronized with the Prisma schema.

---

## Storage behavior rules

### Upload flow

Prefer this flow:

1. Frontend sends upload metadata to backend.
2. Backend validates user, file name, size, MIME type and storage quota.
3. Backend creates a pending `FileObject`.
4. Backend generates a short-lived presigned upload URL.
5. Frontend uploads file to MinIO/S3.
6. Frontend calls confirm endpoint.
7. Backend verifies and finalizes metadata where possible.
8. Backend updates `usedStorageBytes`.

### Download/preview flow

- Backend must check ownership or share-link validity.
- Backend generates short-lived presigned read URL.
- Backend should control response behavior such as `Content-Disposition`.
- Dangerous content must not be served inline.

### Sharing flow

Prefer backend-controlled share links.

A public share link should not be a long-lived raw S3 URL. The backend should validate the share token and then generate a short-lived read URL.

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

Use a denormalized `User.usedStorageBytes` field.

Rules:

- Increase it after successful finalized upload.
- Do not increase it for failed or abandoned uploads.
- Soft-deleted files still count as used storage while the binary object still exists.
- Decrease it only after permanent purge.
- Unit test this accounting logic.

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

## Multipart upload rule

Multipart upload is an important product-quality consideration for large videos, but it is not part of the first MVP implementation.

Document it as a later phase or stretch goal.

When documenting multipart upload, cover:

- why single presigned upload is enough for MVP
- why large videos need multipart upload later
- initiate multipart upload
- presign part URLs
- complete multipart upload
- abort multipart upload
- failure and retry behavior

Do not implement multipart upload unless explicitly requested.

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
- soft delete/restore
- purge selection logic
- share link expiry/revocation
- error mapping

Do not introduce integration/e2e tests in the early phase unless asked.

When adding logic, prefer pure functions or isolated services that are easy to unit test.

Keep `docs/04_quality/test_strategy.md` and `docs/04_quality/test_report.md` updated when test strategy or results change.

---

## Documentation rules

This is a thesis project, so documentation is part of the product.

Keep documentation concise, accurate and synchronized with the implementation.

Important docs:

- `README.md`: quickstart, stack, run/test commands
- `docs/01_product/vision.md`: product vision
- `docs/01_product/scope_contract.md`: MVP, non-goals, acceptance criteria
- `docs/01_product/capability_map.md`: value/productization capabilities
- `docs/01_product/ux_flows.md`: 2-3 key user flows
- `docs/02_architecture/c4_context.md`: C4 context diagram
- `docs/02_architecture/c4_container.md`: C4 container diagram
- `docs/02_architecture/quality_attributes.md`: quality attributes
- `docs/02_architecture/adr/`: ADRs
- `docs/03_design/api.md`: API contract
- `docs/03_design/data_model.md`: data model
- `docs/03_design/error_handling.md`: error model
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
- multipart upload as later phase
- authentication approach

---

## AI documentation rules

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

## Commands

Before running commands, inspect the relevant `package.json` files.

Do not invent commands if scripts do not exist.

Common expected commands after scaffolding may include:

```bash
# backend
cd backend
npm install
npm run start:dev
npm run test
npm run build

# frontend
cd frontend
npm install
npm run dev
npm run test
npm run build
```

If these scripts do not exist, either add them as part of the setup or report what is missing.

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
