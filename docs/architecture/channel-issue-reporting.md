# Observed channel issues

Web and Electron installations independently record channel artwork and EPG
problems observed while using Discovery and the main Xtream live views. There
is no synchronization, background catalog scan, automatic repair or LLM call.

## Detection

`ChannelLogoIssueDirective` captures image load/error events from a channel
card or row, including non-bubbling errors. A source/stream reference and the
actual provider artwork URL identify which image to observe. Empty URLs and
known application/blank placeholders report `missing-url`; failed loads report
`image-error`. A later successful load clears that source/stream's logo issue.
A valid image containing generic artwork is not distinguishable from a logo.
Only rendered views contribute observations; this is not a completeness audit.

Discovery guide sessions, selected Xtream guides and viewport EPG previews
report `empty-epg` only after a completed lookup and its configured fallback
returns no programmes. Rejected provider previews use an available uploaded
XMLTV programme before reporting `epg-error`. Discovery opts into strict resolver
outcomes: provider failures/timeouts are errors, while unavailable source data
is skipped rather than counted as an empty guide. Loading, disabled
EPG, unavailable capabilities, absent sources and cancelled/stale Discovery
requests do not create missing-guide issues. Later successful lookups clear
the corresponding EPG issue. Reports describe an observation, not a diagnosis
of whether the provider, connectivity or channel mapping caused it.

## Local list and export

`ChannelIssuesService` owns a device-local `channel-issues-v1` Web Storage key.
It deliberately uses its own browser-storage adapter rather than the optional
server-synced user-data storage. Each browser origin/profile and Electron
profile keeps an independent list. Source ID, stream ID and issue kind form
the deduplication key; duplicate category appearances therefore share an issue.

The retained record contains channel name, optional country/EPG identity, a
reason and first/last observation timestamps. It excludes artwork URLs, portal
endpoints, credentials, raw errors and provider payloads. Observations within a
minute coalesce; writes debounce for 300 ms and flush on service destruction.
At most 5,000 issues are retained, evicting the least recently observed entry.
Malformed persisted records are ignored. Storage failures leave the in-memory
list exportable and show a visible save warning.

Settings → Library → Dictionary → Channel issues displays logo/EPG filters and
a paged list. Export issues JSON downloads an agent-readable object:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-16T00:00:00.000Z",
  "issues": [{
    "sourceId": "synthetic-source",
    "streamId": 42,
    "name": "Example News",
    "country": "US",
    "epgId": "ExampleNews.us",
    "kind": "logo",
    "reason": "image-error",
    "firstSeen": 1794787200000,
    "lastSeen": 1794787200000
  }]
}
```

Export is local and user initiated. It contains channel identities required for
investigation; nothing is submitted to an agent or external service automatically.
Provider data and dictionary mappings remain unchanged. Previously created logo
repair sidecars/cache are left intact but are unused after the repair rollback.

## Validation

Unit coverage checks deduplication, source isolation, reload persistence, bounded
retention, denied storage, export field selection, non-bubbling image events,
row reuse and EPG failure/success/disabled handling. The synthetic browser E2E
flow checks missing and broken URLs, empty guides, independent filters, reload
persistence and the downloaded JSON in light and dark themes. Shared reporting
has no native IPC or worker dependency; the desktop preview uses the same UI.
