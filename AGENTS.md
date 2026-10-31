# AGENTS.md

## Project and scope

CloudVault is the **Adattárolás a felhőben** BSc thesis: a Vue/NestJS media application using PostgreSQL and S3-compatible storage. Communicate in Hungarian; keep code identifiers, filenames and commits in English.

- Keep changes within the user's current task. Planning/documentation/review requests do not authorize implementation.
- Requirements are targets, not evidence of implementation or permission to start later phases.
- Required SZD2 depth: true resumable batch image import, isolated per-file failures, thumbnail and metadata processors, versioned durable jobs/results, restart recovery, consistent original/derived accounting, comparative measurements and user trials.
- Whole-file retry or idempotent confirm alone is not resumable transfer. Select an existing mechanism through ADR/PoC; revisit ADR-009. Uppy/tus is a suggestion, not an approved dependency; do not invent a transfer protocol.
- Product AI is optional MVP+ after stable Core and explicit authorization; human accept/edit/reject and privacy/licensing review required. Face recognition, biometrics and sensitive-attribute inference are prohibited.
- Cloud deployment, large-video multipart, transcoding, admin/plugin platforms and advanced monitoring remain later scope unless requested.

## Read only the context needed

Use [SKILL.md](SKILL.md) for supervisor/thesis workflow; read it once per task context, not repeatedly. Before implementation, consult the **relevant sections** of [plan](docs/plan.md), [milestones](docs/milestones.md), [README](README.md) and the applicable contracts below. Search headings/symbols before reading entire files. Reuse already-read, unchanged context.

| Task | Canonical references |
|---|---|
| Scope, acceptance, UX | `docs/01_product/`, `docs/plan.md`, `docs/milestones.md` |
| Architecture/decisions | `docs/02_architecture/`, especially relevant ADRs |
| API/errors/model | [api.md](docs/03_design/api.md), [error_handling.md](docs/03_design/error_handling.md), [data_model.md](docs/03_design/data_model.md), `backend/prisma/` |
| Upload/quota/processing | ADR-005/007/008/011/016 and the corresponding API/model sections |
| Tests/evidence | [test_strategy.md](docs/04_quality/test_strategy.md), [test_report.md](docs/04_quality/test_report.md) |
| Security/operations | `docs/05_security_ops/`, README for execution commands |
| AI contribution | `docs/07_ai/prompt_log.md`, `docs/07_ai/verification_log.md` |

The latest explicit user instruction wins; mention material contract conflicts. October requirements override outdated July single-PUT-only/thumbnail-Later assumptions. Update affected contracts before implementation; preserve valid security/accounting invariants.

## Efficient workflow and agents

1. Inspect Git status, relevant code/contracts and existing scripts; preserve unrelated local edits.
2. Briefly state scope, implement the smallest useful change and add meaningful unit tests for behavior changes.
3. Update only affected documentation. Avoid unrelated cleanup, new plan files and repeated full-document rewrites.
4. Finish with changed behavior, actual verification and remaining limits/manual checks. Keep logs/output concise; retrieve detailed output only for failures.

**Default: one agent.** Do not automatically delegate implementation, tests or documentation. Only an explicit user request or a concrete auth/security/quota/concurrency/data-loss risk justifies one focused independent reviewer. Do not send several agents the same work or repeatedly review an unchanged result. For this documentation workflow change, no subagent review is required.

## Consolidated verification

- Write tests alongside behavior changes, but run them after the implementation of the requested subtask settles, not after every edit. An earlier focused diagnostic is justified by a concrete unresolved bug/risk.
- At the end of a code PR, run **one consolidated verification round**: unit tests, typecheck and build appropriate to the change. Use `npm test`, `npm run typecheck`, `npm run build` for a full application code PR.
- If that final full round already covers the changed tests, do not first run an identical targeted suite just to repeat it in full. For a subtask before a later PR-wide round, use the affected suite/workspace only.
- After a failure, fix it and rerun the affected checks first. Repeat previously successful broad checks only if new changes affect their validity or a concrete risk remains.
- Documentation-only changes: diff, local links and instruction/contract consistency checks; **no application tests, typecheck, build, containers or installs** unless executable behavior/configuration also changed.
- Do not start duplicate checks/installations because a command is quiet. Keep and poll its existing session. Inspect CI sparingly; do not repeatedly download unchanged output.
- Backend Jest, frontend Vitest; prioritize ownership, validation, quota/concurrency/idempotency, lifecycle, retry/recovery and error mapping. Do not write tests that merely mirror code.
- Do not add integration/e2e/contract frameworks, deployment or additional CI gates without authorization. Existing unit GitHub Actions was authorized on 2026-10-22: `.github/workflows/tests.yml`, PRs to/main pushes/manual dispatch, `.nvmrc`, root `npm ci`, `db:generate`, `npm test`, synthetic DB URL, no DB/storage services or real secrets. Keep action SHAs pinned and token permissions read-only; no automatic merge.
- Unit-first is not final SZD2 acceptance. Real component/user-flow/recovery/UAT evidence remains required; older rubric applicability and schedule discrepancies stay explicit in SKILL/plan.

## Fixed stack and boundaries

- Frontend: Vue 3 Composition API, Vite, TypeScript, Tailwind, Vue Router; Pinia only for needed shared state. API calls in a client layer, environment-based URLs, reusable empty/loading/error/retry UI. No long-lived sensitive localStorage data without an explicit decision.
- Backend: Node/TypeScript/NestJS/Prisma/PostgreSQL. Thin controllers, validated DTOs, service business logic, centralized config and consistent safe errors/request IDs. Reuse existing validation conventions; do not introduce libraries unnecessarily.
- Binary objects belong in MinIO locally, AWS S3/OCI-compatible storage later; metadata/ownership/state/accounting belong in PostgreSQL. All SDK calls stay inside the storage adapter.
- Backend auth and ownership are mandatory for every protected operation, including continuation. Browser code never receives storage credentials; use backend-controlled short-lived access. Keep auth strategy aligned with ADR-010/014.

## Security and accounting invariants

- Never commit/log secrets, passwords/hashes, tokens, access-granting URLs, file contents or unnecessary PII. `.env` stays ignored/outside image context; only public `VITE_*` configuration reaches frontend builds. Use `.env.example` for variable documentation.
- Validate size, safe filename, MIME allowlist and actual signature; do not trust extensions/browser metadata. HTML/SVG/JS/XML/unknown content is unsafe inline. Check ownership and use short-lived read URLs with safe Content-Disposition; no provider details/stacks in responses.
- Original upload init atomically creates pending metadata and reserves bytes; validated confirm transfers reserved→used **once**. Keep stable operation identity and retry-safe state.
- Use denormalized User used/reserved counters, not per-request SUM. Enforce `used + reserved + requested <= limit` transactionally across uploads and derived outputs.
- Each derived attempt needs its own immutable create-only key and exact reservation before writing. Result/state/accounting/audit finalize atomically; duplicate delivery must not duplicate results/charges. Keep failed sibling outputs and originals usable.
- **Unknown I/O outcomes retain reservations.** Positive reservation release requires attempt-specific proven write closure AND verified absence/cleanup. Expiry, lease loss, abort, HEAD404 or DELETE200 alone are not proof. Current adapter evidence is `unproven`; do not invent timestamps/proof or bypass CLEANUP_BLOCKED. Cleanup must irreversibly exclude publication/adoption first.
- Processing starts only after validated upload; durable versioned jobs/results, bounded resources/retry and current lease/fence are required. A decoder child is not an OS sandbox; V8 heap is not a native-memory limit. Extracted metadata is untrusted/private; missing metadata is a valid explicit absence.
- Soft delete hides originals/derived data, keeps used bytes and permits 30-day restore. Decrease used only after proven permanent purge; partial failures stay retryable/accounted. Existing share links are permanently invalidated; restore requires new links. Core sharing uses 32 random bytes/base64url, SHA-256 token hash and 1h–7d expiry; access counters/revocation UI are later scope.
- Keep Prisma and model/API contracts synchronized. Add migrations without rewriting committed history or resetting existing counters/data. Do not delete records needed for unfinished accounting/deduplication.

## Windows/WSL execution

- This machine stores the checkout on Windows, mounted in WSL (example `/mnt/c/Users/ngy-m/Desktop/szakdolgozat/adattarolas-a-felhoben`). Use the actual `git rev-parse --show-toplevel`; run **WSL Bash + Linux node/npm**, not `node.exe`/`npm.cmd`.
- Follow `.nvmrc`/engines; known baseline Node22.23.2/npm10.9.8, `/usr/bin/node` and `/usr/bin/npm`. Inspect resolution if needed; do not reinstall per task.
- Run workspace scripts from root with the single root lockfile. Do not mix Windows/Linux node_modules or install separately in workspaces. `/mnt/c` checks may take minutes; preserve active sessions. Do not move the checkout/change global WSL/Docker settings without a request.
- Docker Desktop needs Linux containers and a reachable **Server** (`docker version`). If WSL integration fails, check and use quoted `/mnt/c/Program Files/Docker/Docker/resources/bin/docker.exe` from repo root. Do not assume an old `/tmp` wrapper exists or repeatedly search/reinstall after a concrete prerequisite failure.
- Full startup: `node scripts/init-env.mjs`, then `docker compose up -d --build --wait` using `docker-compose.yaml`; applies committed migrations and bucket init. Status/logs: `docker compose ps -a`, `docker compose logs --tail=100 <service>`; stop with `docker compose down`, **never routine `-v`**. Stop app containers before conflicting host dev servers.
- Never print resolved Compose config or `.env`; use `compose config --quiet`. Environment init preserves credentials; never reset volumes to fix setup. Config validation is not runtime proof.

Inspect package.json before using scripts; README owns detailed Quickstart. Existing root commands:

```bash
npm ci                     # Only first setup or justified dependency repair/change
npm run env:init
npm run infra:up            # PostgreSQL/MinIO only; optional host-dev alternative
npm run db:generate
npm run db:migrate          # Apply committed migrations; never reset
npm run dev:backend         # Separate terminals, root cwd
npm run dev:frontend
npm test                    # Helper + both workspace unit suites
npm run typecheck
npm run build
```

Targeted: `npm run test --workspace backend -- --runTestsByPath test/<name>.spec.ts` or `npm run test --workspace frontend -- <test-path>`. Other existing scripts: `db:validate`, `db:migrate:dev -- --name <name>`, `test:container`, `infra:status`, `infra:down`. These are alternatives, not a mandatory checklist to run every task. Build/typecheck generate Prisma Client; never invent scripts.

Opt-in real-service tools need separate scope: `storage:verify` uses synthetic MinIO objects; `uploads:cleanup` runs a bounded batch and retains unproven reservations; `scripts/verify-processing-schema.mjs` uses its own disposable PostgreSQL container after backend build (`CLOUDVAULT_DOCKER_CLI` can select the Windows fallback). Never point that verifier at the app DB or call its results worker/recovery evidence. Existing pending-upload cleanup has a bounded non-overlapping worker; this does not authorize starting a processing worker.

## Git, documentation and evidence

- Do not commit on main. Use `feature/`, `fix/` or `docs/` branches and focused Conventional Commits; open a PR to main. Merge only when authorized, reviewed and required CI checks pass. Preserve unrelated edits; do not commit generated outputs or `.env`.
- Keep official thesis documentation under `docs/` unless explicitly requested otherwise. Update existing documents, not duplicate requirements/field lists here. Major decisions need an ADR with status/context/decision/alternatives/consequences/verification.
- For nontrivial AI work, append concise goal/output/files/adjustments to the prompt log and risk/method/result/conclusion to the verification log. Read only the relevant recent entries; do not reload entire historical logs. Include wrong AI assumptions and their corrections, never secrets.
- Reports identify version/date/environment/inputs/steps/expected/actual/evidence. Only executed checks can be PASS; unit/mock evidence is not real DB/storage/browser proof. Author self-tests are not external UAT. Do not erase open recovery, measurement or quality gates to save tokens.
- Write the thesis alongside development; use real numbered/titled/redacted screenshots and reviewed version-aligned artifacts. Paid cloud is not required. SKILL owns supervisor sources, sample-thesis guidance and unresolved dates/rubric questions.
- Existing authorization remains valid: do not ask again for an action already requested. Otherwise ask before stack/DB/auth-strategy changes, major dependencies, multipart, deployment, new integration/e2e/CI scope or destructive rewrites. Documentation alone does not grant these permissions.
