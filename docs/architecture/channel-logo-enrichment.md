# Desktop channel logo enrichment

The opt-in repair service finds replacement logos for missing/broken Xtream live
artwork. It ships with Electron and has no Docker, daemon, API-key or LLM
dependency. EPG enrichment and AI matching are separate future stages.

## Ownership

- `libs/shared/channel-enrichment`: deterministic identity matching.
- `libs/shared/interfaces/src/lib/channel-enrichment.interface.ts`: public types
  and the internal storage request union.
- `apps/electron-backend/src/app/services/channel-logo-*`: scheduling, public
  catalog download/indexing and validated local image caching.
- `apps/electron-backend/src/app/events/channel-logo.events.ts`: narrow IPC.
- `apps/electron-backend/src/app/database/operations/channel-logo.operations.ts`:
  sidecar storage through the existing database worker.
- `libs/services/src/lib/channel-logo.service.ts`: bounded renderer subscriptions.
- Library → Dictionary → Channel logos: enable/disable, run and status controls.

The two optional preload methods, `channelLogoControl` and `channelLogoLookup`,
are the capability boundary. Browser/PWA runtimes do not expose the setting or
perform desktop repair requests. Discovery live cards and the main Xtream live
grids/rows supply source/stream references to the shared artwork components.
Other cards without those references retain existing behavior.

## Identity and fallback

The iptv-org public channel and logo catalogs supply canonical identities,
aliases and candidate URLs. Catalog metadata is public-domain according to the
[database license](https://github.com/iptv-org/database/blob/master/LICENSE);
channel artwork remains sourced from the URLs and is not bundled into releases.
Catalog format: [API reference](https://github.com/iptv-org/api).

An exact canonical `epg_channel_id` can identify a channel. Otherwise require an
exact normalized name/alias and explicit country evidence. Country evidence can
come from a two-letter provider prefix/suffix or the Discovery country mapping.
Conflicting countries and ambiguous aliases abstain. Normalization folds case,
Unicode width, whitespace and a terminal quality marker; it preserves channel
numbers, regional words and time shifts. Closed channels are excluded. No fuzzy
matching or generated logo URLs are used.

Use provider artwork first. A missing URL or actual image error subscribes to
the replacement. A good provider logo never initiates a renderer repair lookup.
Discovery's default app icon is treated as missing channel artwork. Original
provider fields and dictionary names are never written by this service.

Initial artwork support is currently-in-use, channel-level PNG/JPEG entries.
Feed-specific, vector and other formats are excluded conservatively. Identities
without supported artwork still participate in ambiguity detection. A channel
without a safe unique match retains its existing placeholder.

## Persistence and scheduling

`channel_logo_settings` and `channel_logo_jobs` are additive sidecar tables in
the active profile's SQLite database, lazily initialized in the worker. The key
is source ID plus live stream ID, so duplicate category appearances share a job.
Each job includes a hashed provider/content revision, state, attempts, due time,
lease, image hash and canonical match provenance. Credentials participate only
in revision hashing; they are not copied into sidecar rows or network requests.

Maintenance is disabled by default. Once enabled:

- A process-local runner wakes every 15 seconds and runs at most 25 jobs.
- A bounded audit reads 300 catalog rows per worker request, yielding between
  chunks, every five minutes. Empty logos are queued proactively; visible broken
  images queue on error. Disabled live catalog selections are excluded.
- Successful renderer catalog-refresh notifications wake an audit. Startup and
  periodic persisted audits catch notifications missed without Discovery open.
- Each process has one active run; two-minute persisted leases recover work after
  termination. A backward clock change cannot strand a far-future running lease.
- Transient failures back off exponentially to one day. A remote failure also
  backs off the run five minutes instead of cascading through the whole queue.
- Unresolved identities retry weekly; repaired images become due after 30 days.
- Metadata changes invalidate the prior binding. Completion checks the current
  revision and lease, so late work cannot attach to replacement/deleted content.
- Audits retain previously supplied Discovery country evidence when they have
  no new country hint. Explicit updated evidence replaces the old value.
- Disable aborts network work and hides renderer fallbacks, retaining the cache
  and queue, and releases running leases for the next enabled cycle. Closing
  the app stops work; nothing runs while it is closed.

An audit is a bounded periodic reconciliation, not a dependency on a renderer
event alone. The persisted last-audit timestamp and durable jobs support restart
recovery. Re-enabling resumes due jobs; Run now audits current metadata without
forcing every unresolved channel to download again.

## Network and cache limits

Catalogs are cached for seven days; a valid prior snapshot remains usable during
an outage, with another download attempt deferred a day. Channel metadata never
gets sent to a search service. Only fixed public catalogs and selected artwork
URLs are fetched. Main-process HTTP uses URL validation, DNS pinning, redirect
validation, 15-second timeouts and bounded decompressed responses.

Catalog responses are capped at 15 MB each; channel and image counts and relevant
fields are validated. Indexing yields every 300 channels. Images are capped at
1 MB, dimensions at 4096 per side and four million pixels before native decoding.
Native decoding must succeed. Results are resized to at most 256 pixels and
stored as PNGs no larger than 128 KiB, using atomic writes and SHA-256 filenames.

The cache sits beside the active profile's database in `channel-logos/`.
Thumbnail hash checks reject corruption and path traversal. Pruning runs at most
hourly after a successful download and retains up to 1000 thumbnails/128 MB.
Renderer subscriptions retain at most 500 references, batch up to 50 lookups,
and poll every 15 seconds while subscribed. Known hashes avoid resending image
bytes; unchanged references and a per-process URL cache avoid duplicate downloads.
Small cached PNG data URLs work under the existing renderer image CSP.

Only the isolated E2E data-root runtime can use the strict loopback fixture
catalog override. Production catalog and artwork requests reject private targets.
No generic `DB_CHANNEL_LOGOS` preload or raw storage command is exposed.

## Validation

Focused Electron unit tests cover matching, retries, cancellation, cache reuse,
catalog validation and image header bounds. A subprocess opens real historical
SQLite tables with Electron's native SQLite module, initializes the sidecars,
reopens the file and checks lease recovery, duplicate IDs, stale completions,
disabled work and retained source rows. Existing preload/worker tests distinguish
main-only operations from renderer-exposed DB operations.

`apps/electron-backend-e2e/src/channel-logo-enrichment.e2e.ts` uses only a local
synthetic catalog/provider. It checks opt-in, missing/broken artwork, shared
downloads, Discovery/main-live rendering, light/dark visibility, malformed IPC,
restart with the catalog unavailable and disable. The service has browser
capability and renderer subscription unit tests. Run the affected project targets
and this Electron flow after worker/IPC/artwork changes; rebuild the worker first.
