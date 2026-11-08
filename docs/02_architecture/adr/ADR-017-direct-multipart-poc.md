# ADR-017: Direct S3 multipart transfer PoC

## Status and date

Accepted for the isolated PoC, 2026-11-01. Uppy S3 is the selected candidate for direct multipart integration. This is **not** acceptance of complete SZD2 resumable image import or authorization to replace the production upload path.

## Implementation status

`tools/multipart-poc/` contains a real MinIO + browser experiment. The PoC itself left the application's single-PUT init/confirm, Prisma schema, storage adapter, worker and UI unchanged. The subsequent persistence-only slice implements the import/multipart Prisma schema and additive migration, with legacy transport/type guards; multipart orchestration, API and UI remain unimplemented. Uppy is pinned in root devDependencies, using the existing single lockfile. The experiment is opt-in, outside application builds and CI; it uses an isolated native MinIO process with random credentials, temporary data and its own bucket. It does not read `.env` or the app DB.

## Context

The October requirements call for actual resumable batch image import. Replaying a complete PUT and idempotent confirm do not retain a partially transferred file. The experiment must distinguish retained complete parts from a failed part, and must include images smaller than the S3 minimum non-final part size.

## Decision

- Client: `@uppy/core@6.3.0` + `@uppy/aws-s3@6.3.0`, without Dashboard or Companion. A Vue 3 Composition API component uses the headless client; the existing application UI can be retained in a later integration.
- Protocol: S3 multipart, not a custom chunk protocol and not HTTP form `multipart/form-data`. Part bodies go directly from browser to MinIO. The isolated signing adapter uses the existing AWS SDK and returns short-lived presigned URLs; credentials stay in the server process.
- PoC part size: **5 MiB = 5,242,880 bytes**. Force multipart for both test files to expose the small-file boundary. This is a measurement configuration, not a final production size threshold.
- One active Uppy file; installed Uppy 6.3.0 sends that file's parts sequentially. Production global concurrency and validated configuration remain a separate contract decision.
- Restore a new Uppy instance with the public `s3Multipart` file state (`key`, `uploadId`), then let it issue ListParts and send only missing parts. That identity is supplied by the local PoC server in memory; it is not a durable authorized import implementation.
- Experiment signing is restricted to pre-created synthetic sessions and bounded part numbers, with exact loopback Host/Origin checks. This is not production authentication or quota enforcement.

## Alternatives considered

| Alternative | Assessment |
|---|---|
| Current full PUT retry | Retain as production baseline; cannot resume within a file. |
| Uppy S3 direct multipart | Selected candidate: fits existing presigned MinIO path, provides standard part listing and reconstruction; no new transfer service. |
| tus-js-client / Uppy tus + Node tus server or tusd | Remains relevant for small-image resumability. Extra receiving service/data path and temporary storage/accounting need evaluation. tus may itself use S3 multipart underneath. |
| Hand-written chunk protocol/uploader | Rejected: unnecessary protocol and client lifecycle work. The PoC's raw HTTP interruption driver only injects a real fault; it is not a product transfer protocol. |

## Consequences and limits

The storage-confirmed unit is a **complete part**, not every byte written to a request. An interrupted part is resent from its beginning. A small image that fits in one part is fully resent. AWS requires at least 5 MiB for non-final parts; the final/only part may be smaller. Therefore direct multipart alone does **not** resolve the small-image intra-file resume requirement. Do not silently declare small-file retry equivalent to resume or assume supervisor acceptance. A tus PoC or explicit scope agreement is still needed for that gap.

Production integration must add durable owner-bound import/transfer identity, file re-selection/content identity after refresh, expiry and access renewal, transactionally reserved quota, authoritative part validation, complete/confirm recovery and once-only activation/job creation. Never infer content identity from a multipart ETag. Cleanup must exclude late publication and respect uncertain-write reservations; this PoC's synthetic cleanup is not application quota-release proof. Incomplete parts consume physical storage before a final object exists.

Uppy lifecycle must be wrapped in a client-layer adapter. `destroy()`/cancel is not a durable pause/recovery strategy. The PoC does not persist files, URLs or credentials in browser storage and suppresses default client logging. Existing UI controls/progress/error models can be connected later; no existing Vue upload components were changed.

## Verification

Actual inputs, payload counts, browser requests and full-object SHA-256 results are recorded in the [test report](../../04_quality/test_report.md#multipart-poc--2026-11-01) and its JSON evidence. The interruption is a Node HTTP request with a full Content-Length, a successfully written prefix and socket destruction before request completion. A fresh Uppy browser instance resumes the same transfer through standard S3 operations. This proves mixed-driver protocol interoperability; **not** Uppy-native mid-request pause, actual page-refresh persistence, MinIO restart or end-to-end application integration.

Measurement counts application payload bytes handed to the interrupted HTTP request and the successful browser PUT bodies. It excludes headers/TCP/TLS overhead and does not claim receiver-side partial-byte telemetry. The final complete object is fetched and SHA-256-compared, and the retained part's ETag is checked unchanged before CompleteMultipartUpload.

## Sources

- [Uppy S3 API and server-side signing](https://uppy.io/docs/aws-s3/)
- [S3 multipart part size limits](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html)
- [S3 multipart lifecycle](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html)
- [Incomplete upload storage and abort](https://docs.aws.amazon.com/AmazonS3/latest/userguide/abort-mpu.html)

## Product contract clarification – 2026-11-01 (documentation only)

The planned [multipart API](../../03_design/api.md#multipart-képimport--tervezett-szerződés-2026-11-01) and [durable model](../../03_design/data_model.md#multipart-import-és-transfer--tervezett-2026-11-01) now define owner-bound import/file/transfer identity, one reservation, fixed session expiry, part-only browser grants and backend-controlled completion/confirmation. Defaults:5MiB immutable parts,120s part grants,24h import lifetime,50 accepted files/import, two active files with one sequential part each. These are target configuration, not installed runtime settings or acceptance of the small-image resume gap.

**Material PoC limitation:** Uppy6.3.0 exposes `signRequest` and its S3 uploader performs direct ListParts/Complete. The PoC demonstrated that path; it did not demonstrate a supported adapter to the new cookie-auth JSON control plane with backend-owned manifest/complete. Before frontend integration, prove a supported public library extension or revisit the client choice through ADR/PoC. Do not assume old Uppy5 callbacks exist in6.3.0, fork private uploader internals, weaken backend checks, introduce an S3-emulation protocol, change authentication or install an alternative implicitly. No browser Create/List/Complete/Abort presigned rights are authorized by the product contract.

Create-only CompleteMultipartUpload support, exact size enforcement and attempt-specific write-closure evidence require real provider verification. AWS documents that a complete response can carry an error inside HTTP200, and abort can race in-flight parts; SDK response parsing and conservative recovery are required. Unknown outcomes retain reservation. References: [complete semantics](https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html), [abort semantics](https://docs.aws.amazon.com/AmazonS3/latest/API/API_AbortMultipartUpload.html).

Production single-PUT remains unchanged; transport cannot switch within a file attempt. This documentation is not an implementation or cutover approval.
