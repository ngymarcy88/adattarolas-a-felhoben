# ADR-018: Uppy 6 Companion-compatible application bridge

## Status / date

Accepted for implementation, 2026-11-03. The user explicitly chose to retain Uppy6 and redesign server integration, preserving authorization, backend completion and quota. This supersedes ADR-017's frontend integration gate; the proposed Uppy5 downgrade was rejected. No new Companion service, credentials, queue, XML/S3 emulation or private library patches are introduced.

## Context and decision

Installed `@uppy/core`/`@uppy/aws-s3`6.3.0 expose `companionEndpoint`. Its public JSON routes support create/list/sign/complete/detach. Implement this narrow adapter in the existing Nest application at `/api/v1/uppy/s3/multipart`. Binary parts still go directly to MinIO using short-lived exact-length grants. The existing JSON import/transfer API remains canonical for durable identity, resume/hash verification, status, explicit cancellation and ACTIVE confirm.

Use same-origin `/api` proxies in Vite/nginx: Companion's fetch uses the default same-origin cookie mode and cannot attach cross-origin session cookies. Every bridge request requires SessionGuard and `Sec-Fetch-Site: same-origin`; an Origin, when present, must match the configured frontend. POST/DELETE also require the existing exact OriginGuard. GET signing therefore cannot be triggered by cross-site images/links with a session cookie. No bearer URL or browser storage credentials are added. Proxying preserves Origin and cookies, and does not proxy binary UploadPart traffic.

A pre-created application's transfer UUID is the **virtual key and uploadId** presented to Uppy. Neither is a provider identity or capability. Create attaches to this owned transfer; it cannot reserve quota/create another logical upload. List returns the fresh server-observed PartNumber/ETag pairs required by Uppy; this narrowly scoped representation exposes opaque provider ETags (not hashes, credentials or URLs), never storage keys/provider uploadIds. Existing JSON projections remain unchanged. Complete accepts a bounded syntactic client part list for compatibility, discards it, then invokes the authoritative service re-list/seal/complete. Only STORED/SUCCEEDED returns compatible completion success; pending returns409/Retry-After and requires manual reconciliation. Library success alone never refreshes the gallery: separate ACTIVE confirm does.

**Detach semantics:** Uppy destroy/removal sends DELETE even for a paused/disposed client. This compatibility endpoint checks ownership and returns204 without cancelling the durable transfer, aborting provider I/O or releasing quota. The UI's explicit terminal cancel uses existing POST transfer/cancel. Pause aborts local requests while preserving durable parts. This conservative adaptation is intentional and must not be described as provider-abort proof.

## Lifecycle / limits

The panel has two global workers, each running one Uppy instance with limit1 and sequential parts; the server-snapshotted chunk size is used. Uppy6 itself may retry uncertain part I/O a bounded number of times; a network attempt whose ACK was lost may be resent. Known completed parts are skipped on fresh ListParts/manual resume; zero retransmission under every lost ACK is not claimed. Offline/page leave pauses local work; no reconnect-driven UI restart. No Golden Retriever/localStorage/IndexedDB persistence. Files, hashes and URLs remain in private memory; all logger methods are disabled.

Page refresh discovers imports from the authenticated backend. A pending OPEN file requires local re-selection and a full SHA-256/size match via resume before new PUTs. Fully transferred/STORED files can be finalized without local bytes; successful files are not uploaded again. Unknown init replays stable clientFileId and payload; no automatic transport fallback/re-init. Status reads are serialized with a2s start gap, failures require manual retry, no unbounded polling. Gallery notification follows successful ACTIVE confirm and is coalesced per worker wave, with the existing gallery debounce preserved.

## Alternatives and consequences

Uppy5 callbacks were rejected by the user. S3 XML emulation, private uploader forks and direct browser CompleteMultipartUpload grants would weaken maintenance/security boundaries. A full Companion deployment adds unnecessary services. The narrow public JSON adapter preserves the existing business service and quota transactions, but requires same-origin routing and careful detach semantics. Small (<5MiB) single-part image interruption still retransmits that part and does not satisfy intra-file resume; the outstanding SZD2 acceptance gap remains.

## Verification

Use actual installed Uppy6 with simulated Companion HTTP/part responses for retained-part/progress/cancel tests; controller/service ownership/guards and authoritative complete tests; scheduler/reselection/recovery and Vue template tests. Existing Jest/Vitest only. Full unit/typecheck/build once at subtask completion; failures rerun only affected checks. Real proxy/cookie/MinIO CORS/ETag exposure, browser reload and actual interruption/restart remain explicit manual gates unless actually executed. Unit success is not provider proof.

Sources: installed public declarations and `CompanionS3.js`/`S3Uploader.js`; [Uppy S3 docs](https://uppy.io/docs/aws-s3/) and [migration guide](https://uppy.io/docs/guides/migration-guides/).
