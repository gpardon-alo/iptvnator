# Geographic Discovery

The `/workspace/discovery` child route is owned by `workspace-discovery-feature`
under `libs/workspace/discovery/feature` and uses the normal workspace header and
navigation rail. Legacy `/discovery` links redirect here, retaining query search.

This English-language view uses the shared header source selector. Selecting a
live-enabled Xtream source reads its live
catalog through `XTREAM_DATA_SOURCE`, respecting runtime selection, parental
locks and the existing browser catalog cache. Opening a saved-source channel plays its selected provider alternate through the
shared player. EPG is loaded only for the selected channel.
The selected-channel schedule is shown only after a saved-source channel is selected.
With no sources, the synthetic demo remains available. An unsupported selected
source shows a prompt to choose a live-enabled Xtream source rather than another
source's channels. Switching the header selection stays on Discovery and closes
any preview from the previous source.

## Reuse and scope

The feature reuses `ContentCardComponent`, its lazy artwork and keyboard
activation, Angular CDK horizontal virtual scrolling and focus trapping,
Material icons, app typography and the existing focus conventions. Shared
thumbnail styles accept `--cover-aspect-ratio`, defaulting to their original
`2/3`; Discovery uses `16/9`. Card title and metadata sizes also accept scoped
`--cover-title-size` and `--cover-meta-size` overrides with unchanged defaults.
Optional `--cover-meta-color` and `--cover-meta-opacity` overrides let Discovery
use opaque app-muted text for readable metadata in every palette; other consumers
retain inherited text and 0.6 opacity.
Discovery inherits the resolved application palette from `body[data-app-theme]`,
including Light, Dark, Cream, Mocha, Night Owl, Black OLED and System mode.
Page/panel surfaces, text, selection, hover, focus, native controls, dialogs,
classification results and the shared guide use the existing app theme tokens.
Map ocean/land colors derive from the same surface and accent tokens; only the
league artwork keeps neutral light/dark mattes with contrasting fallback text
for logo readability. Discovery
does not override shared theme tokens or keep a separate theme setting.
The selected UI language is untouched. The rail shortcut is translated.
The map and side filters expand upward below a compact action row; removed
promotional headings and source-review totals do not reserve empty layout space.
The channel ribbon keeps its lower grid allocation and shows its channel count
without a promotional heading. Dictionary actions and the source-menu refresh
retain keyboard focus and disabled states. Review totals remain available on
the Dictionary page; loading/errors retain their status/alert feedback.

The new screen-specific pieces are map exploration, local classifications,
filters and the explicit playback/source preview. The demo catalog lives in
`discovery-catalog.ts` and has no provider credentials or playable URLs. The
country/territory inventory lives separately in `discovery-locations.ts`.

## Interaction contract

- Locations, categories, languages and qualities use OR within a dimension,
  AND across dimensions; an empty selection is unrestricted.
- Source quality comes from explicit demo metadata or the optional saved mapping
  `quality` field (`4K`, `FHD`, `HD`, `SD`, `Unknown`). Missing quality defaults to
  Unknown; provider names are never used to infer it. Quality filters also constrain the
  source selector. Unknown quality remains its own choice.
- Each fixture has a logical channel ID and distinct source IDs. Regional feeds
  stay separate even when their displayed names match.
- The map and location list select the same locations. Only locations with active
  catalog entries are interactive. US state selection is available in the
  United States map view. Browsing the map does not silently select locations.
- Categories are application classifications, independent of provider folders.
- The virtual ribbon renders a bounded window. Opening the preview retains
  filters, selected channel, region and ribbon scroll position. Escape or Back
  returns focus to discovery; source switching remains inside the preview.
- Filters persist in the prototype's own
  `iptvnator-discovery-prototype:v1` localStorage key. Search is authoritative in
  the shared header's `q` URL parameter, including reload and history changes.
  Clear filters also cancels queued shell typing with `WORKSPACE_CLEAR_SEARCH`.
  Preferences flush when the component is destroyed and on browser page hide,
  so immediately navigating to Dictionary or reloading retains the latest filters.
  Existing sources, cached
  catalogs, favorites, history and app settings are not modified by classification.

## Current-stream classifications

The Dictionary page offers live-enabled Xtream sources. A real source starts
with pending, unclassified live streams. **Dictionary → Classify current
streams** runs a one-time local rules pass and saves the result. Neither opening
the screen nor refreshing the catalog runs classification automatically. New
stream IDs remain pending until the next explicit pass.

Each mapping contains a stable source-scoped live ID, custom display name,
country/category/language, a derived `categories` array and the original
`provider: { source_id, stream_id, name, category_name }` evidence. Provider IDs
are portable Xtream IDs, never Electron SQLite row IDs. Saved mappings remain
per stream. For real-source cards, the editable top-level `name` is the grouping
key within the selected source: matching trimmed, case-sensitive names share one
card, regardless of country, category or language. No quality suffixes or other
provider-title fragments are stripped automatically. Changing `name` controls
joining/splitting cards; users keep regional variants separate by naming them
differently. Each unique stream ID remains an alternate labelled with the exact
`provider.name`, reusing the existing multi-source card and chooser. Repeated
copies of the same stream ID appear once as an alternate. Grouping is a read-only
projection and performs no migration or classification write.

Filters operate on each alternate's own country/category/language/quality. One
alternate must satisfy every active dimension; different alternates cannot
combine their metadata to create a false match. The card displays the first
matching alternate's metadata; the preview follows the selected alternate.
Channel totals count groups, stream totals count matching unique alternates,
and each category counts a group once when it has a matching alternate. Countries
remain selectable on the map even when their alternates share a root name.

`country`, `category` and `language` are the authoritative editable/filter fields.
The legacy `categories` array is a derived display-label summary retained for
export/storage compatibility. It is never an independent classification input.
The mapping JSON view recomputes this summary from the current editor draft.

The pure classifier lives in `portal-shared-util`. Rules recognize explicit
country prefixes/names, genre words and language hints in names/provider folders.
Stream genre hints take precedence over broad folders. Conflicts remain unknown.
Classification version 4 treats the standalone DAZN name in a stream or provider
folder as Sports, ahead of generic genre hints, without changing country or
language inference. Version 3 recognizes the explicit trailing pipe tags `| RD`,
`| CR`, `| PANAMA` and `| MX` as Dominican Republic, Costa Rica, Panama and Mexico.
These tags take precedence over broader country/folder hints and supply Spanish
under the user-defined feed policy. Only a complete trailing tag matches; short
codes inside programme names do not. Existing populated languages remain protected
when filling blanks. As introduced in version 2, classification uses editable national-language defaults when no explicit
language hint exists; existing languages and conflicting explicit hints are retained.
The defaults live in `portal-shared-util`'s `discovery-language-defaults.ts`,
independently of synthetic demo metadata. Spanish-speaking South/Central America
and Mexico default to Spanish, with Brazil → Portuguese, Belize/Guyana → English,
Suriname → Dutch and French Guiana → French. France, Germany, the UK and other
unambiguous national markets have their corresponding defaults. Canada,
Switzerland, India and other multilingual markets have no single fallback.
Country never supplies a genre. The editable geography has 69
countries and territories. Unrepresented countries require an inventory
extension. Quality remains Unknown; an HD
name suffix is not a verified resolution.

Each field is independent: a known Sports category remains filterable even with
an unknown language or country. The Unclassified category contains only streams
with no category. It preserves location/language/quality selections. Entering it
replaces known genre selections; selecting a known genre exits Unclassified.
Known genres still combine with OR. Saved selections that mix known genres with
the old Unclassified section discard the latter on read.

The paginated review view is labelled Needs review and can isolate missing
country, category or language separately. Each row names its missing fields;
overall completeness never replaces a known facet. Existing persisted status
values remain compatible and are not used to project category or language.
Cards show country, category and language, using provider artwork when available
and a neutral app icon when absent, rather than synthetic demo artwork.
Users can edit all three fields and the display name, export/import mapping JSON, rerun
rules for unmatched streams, or explicitly reclassify a selected stream. Bulk
reclassification preserves manual edits, including partial manual mappings; the
selected-stream action explicitly replaces them with the current rule result.
**Import dictionary** accepts the exported JSON array (maximum 32 MiB) for the
selected source. Validate the complete file before a single atomic storage write:
source-scoped IDs must remain unchanged, fields must match the portable
mapping schema, and country/category/US state values must be supported. Imported
entries replace matching saved mappings and become manual edits, including partial
classifications. Omitted and absent-stream mappings remain stored. Current catalog
provider evidence wins over imported evidence for active streams; absent imported
streams stay off screen. Derived labels and completeness are rebuilt from the
edited fields. Repeated IDs with matching editable fields and provider names merge,
including duplicates from different provider folders; conflicting duplicates abort
with an entry number. Exports emit one record per source-scoped stream ID. Import
announces reading progress, focuses its result and reports validation failures with
fixed field names and entry numbers, without echoing provider data. Failed reads,
validation or writes retain previous mappings. Import
is device-local; exporting still includes only the current catalog's visible rows.

Quality is an optional top-level dictionary field, separate from the derived
`categories` labels and classification completeness. Historical mappings without
it remain valid and display Unknown. Imports, storage and packaged baselines
validate the same five values; duplicate comparison includes effective quality.
Saved quality drives each real stream's filter and chooser label and survives
provider refresh, manual edits and explicit classification actions.

**Fill missing languages** is a separate explicit save action for existing mappings,
including partial manual mappings. It fills only blank languages, prefers explicit
feed-language hints over country defaults, preserves every other field and keeps
conflicting hints unresolved. Refresh/load never applies these defaults to saved
records or writes them automatically; upgrading the app alone leaves storage intact.

`DiscoveryMappingStorage` in `portal-shared-data-access` owns device-local
IndexedDB `${sourceProfileName()}:discovery-mappings-v1`, store `sources`, keyed
by source ID. It is independent of the 24-hour catalog cache and has no TTL.
Mappings are neither uploaded nor synchronized between devices. Reads fail
closed on corrupt/unavailable storage; failed writes retain the prior saved
version and report retry guidance. Retained mappings for absent streams survive
so that returning streams can regain their custom fields. A refreshed provider
name updates the evidence without replacing custom metadata.

The shared header source menu's Refresh action uses `PlaylistRefreshActionService`
and its runtime-specific behavior. Browser refresh clears only the chosen source's provider cache and
reloads; classifications survive. Mapping actions use cached catalog data and
make no classification-service or AI requests.

`SourceCatalogUpdatesService` publishes renderer-local live-catalog completion
notifications. PWA cache misses (including renewal after the 24-hour TTL) publish
after the fetch and cache acceptance succeed; cache hits and invalidation alone
do not publish. Desktop initialization publishes after remote live work and
successful restore, and edit-time live scans publish after consuming restore
state. Failed, cancelled and superseded work does not publish.
An open Discovery session reloads only for its selected source, coalescing
notifications and waiting for active loads or edits. Switching sources discards
queued work; destroying the session removes its subscription. Closed Discovery
sessions read the latest catalog when opened. This adds no polling timer: PWA
TTL renewal still happens on the next catalog access.

## Dictionary in Settings

`/workspace/settings/dictionary` places the editor under Settings → Library.
The settings section defers loading `DiscoveryDictionaryComponent`, whose own
`DiscoverySourceSession` uses the same source-scoped storage and remembered
selection as Discovery. It renders only after the source library is ready and
offers live-enabled Xtream sources, an empty state and load-error retry.
Switching sources recreates the editor so drafts cannot cross source boundaries.
The former Discovery classification modal and settings gear are removed.

The Dictionary card is indexed by Settings search, including classification,
mapping, import and export keywords. Editor controls are standalone from the
parent Settings form: dictionary actions save immediately and do not enable the
Settings Save/Discard bar. Shared editor styles use app surface/separator tokens
so the page inherits the app theme without a Discovery host.

## Static map assets

Central America and Caribbean are separate application discovery regions. Central
America contains Belize, Guatemala, El Salvador, Honduras, Nicaragua, Costa Rica
and Panama; Mexico keeps its existing North America placement. The Caribbean
contains all 13 sovereign island countries and 15 separately selectable territories,
including Puerto Rico. South America includes all 12 countries plus French Guiana
and the Falkland Islands. Country/territory codes are checked against
[UN M49](https://unstats.un.org/unsd/methodology/m49/overview); these application
regions intentionally keep Mexico's existing placement rather than reproducing
every M49 grouping.

World geometry is assigned to the inventory's region before filtering. Small
Caribbean islands absent from the bundled 1:110m polygons use schematic point
markers, with the same keyboard selection, focus and labels as polygons. Nearby
markers have small visual offsets to remain independently selectable; the list
is the alternative for dense island clusters. French Guiana's ring is separated
from Natural Earth's France multipolygon, so selecting either location preserves
their distinct codes. No remote map runtime or new map download is required.

The country editor groups its options by region. Supported national feeds
include Portugal, Netherlands and Switzerland in Europe,
and Turkey, Qatar and Saudi Arabia in Asia, using the bundled world geometry.
Existing persisted codes and
classification records are retained; newly supported saved codes become readable
without reclassification. Adding an inventory entry does not assign a country
to a stream with an empty country field. Language metadata in the inventory is
for synthetic demo generation only; real stream defaults use the separate,
explicit national-language policy above.

`apps/web/src/assets/discovery/world.json` and `states.json` contain rounded SVG
paths derived from Natural Earth's public-domain country (1:110m) and US state
(1:50m) GeoJSON. Map assets and synthetic SVG channel marks are served locally;
no external map runtime, map tiles or API keys are required. Boundaries are for
visual discovery, not a claim about administrative disputes.

Sources: [Natural Earth terms](https://www.naturalearthdata.com/about/terms-of-use/),
[country data](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson),
[state data](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_1_states_provinces.geojson).

## Validation

The Discovery project participates in Tier A unit source coverage.

`discovery-theme.e2e.ts` saves all six app presets through Appearance settings
and checks Discovery against the inherited palette with the OS in the opposite
mode. It covers map selection, channel text, filter states, keyboard focus,
the shared header search, Sports tiles, System changes while the route is open, and
success/error classification feedback in both light and dark modes.

`pnpm nx test workspace-discovery-feature` checks source loading, retained manual
edits, storage failures, stale responses and multi-dimensional filtering.
`portal-shared-util`'s `discovery-classification` specs check conservative rules
and portable identity. The browser flow checks one-time classification, manual
review, JSON export, reload and source-refresh retention alongside demo coverage.
The original filtering checks cover
quality constraints and regional feed identity. The atomized browser target
`web-e2e:e2e-ci--src/discovery-prototype.e2e.ts` covers map/list selection,
state filtering, keyboard navigation, empty results, source selection and
preview return without provider requests. The real-source flow also verifies
known-category/unknown-language filtering, category counts against ribbon results,
independent missing-field review and switching out of Unclassified.
Regional checks cover Central America, Caribbean polygons and island markers,
the South American additions, map/list parity and persistence of new location IDs.
`discovery-shell.e2e.ts` covers legacy redirects, URL/history search, cancelling
queued typing, source switching without navigation, reload and unsupported sources.

## Live playback

Discovery mounts the shared `WebPlayerViewComponent` for inline playback and
uses `PORTAL_PLAYER` for configured external players and diagnostic fallbacks.
The source settings are ready before the route opens. `DiscoveryPlaybackSession`
loads the current source through `XTREAM_DATA_SOURCE` and uses `XtreamUrlService`
for live URLs and the provider-supported Auto TS fallback, resolving account
output formats before playback when they are absent from the saved source. It preserves source
User-Agent, Referer and Origin. The selected mapping's original source ID and
provider stream ID determine playback; editable root names only determine grouping.
URLs and credentials are never written into classification mappings.

Catalog loading persists categories before importing streams, joining desktop content
by the local SQLite category ID and API content by the provider category ID.
Parental-lock changes clear visible catalog rows, invalidate pending loads and
close the Discovery player before reloading through the filtered data source.
LAN HTTP origins use a fallback session identifier when `randomUUID` is unavailable.

Alternate changes and closing the player invalidate pending source resolutions.
Unhandled Escape closes the preview even when focus is inside the player;
fullscreen and player popovers retain Escape ownership.
Closing destroys the shared inline player. External players follow their existing
application lifecycle. Recent history uses `PlaybackHistoryGate` and is recorded
only after confirmed playback. Demo channels remain non-playable. Resolution
failures offer retry; media diagnostics and recovery remain owned by the shared
player. The selected-channel schedule reuses `EpgTimelineComponent` in the middle of the
channel information row. `DiscoveryGuideSession` independently loads the selected
provider alternate through `StreamResolverService.loadEpgItems`, preserving the
existing uploaded/manual mapping and provider fallbacks, EPG opt-out, and display
offset. Shared `toEpgProgram` normalization preserves epoch timestamps. Loading,
unavailable/error states, retry, collapse, date navigation and programme details
use the shared timeline; archive playback is not enabled in this view. Selection
generations discard late guide responses without interrupting video playback.

## Saved US subdivisions

`ClassifiedStream.state` is an optional subdivision code such as `US-FL`, used
only when `country` is `US`. The inventory in `discovery-us-states.ts` supports
all 50 states and Washington, DC using the existing bundled state geometry.
No storage version change is needed: existing IndexedDB records without the
field remain valid, reads validate its optional string shape, and structured
mapping writes/exports retain it. Provider refresh reconciliation preserves it.

The classification editor offers a state/district selector for US rows. Leaving
it empty means nationwide or not specified; it is not a missing classification
field. Changing country away from US clears the state on save. Unsupported
codes do not become active map facets. State is separate from the existing
country/category/language summary in `categories`; it does not change grouping.

Each provider alternate carries its own state facet into the shared filters.
A state selection matches only that state's alternates; selecting the United
States includes both regional and nationwide alternates. Map availability uses
both country and state IDs from the current catalog, including every alternate
in a grouped card. Category counts follow the same location filtering. The demo
keeps its six-state sample; saved sources can use the complete inventory. States
are assigned explicitly, not inferred automatically from provider names.

Map framing is configured in `discovery-map-framing.ts`. Region-specific view
boxes remove excess padding; mild SVG presentation transforms adjust the existing
projection's perceived proportions without changing paths, location identities or
selection. Shapes and their labels share the same transform. SVG retains uniform
viewport fitting at different screen sizes. Regional views retain the small
region caption and omit its large promotional text to keep the map unobstructed.

## Packaged classification baselines

The checked-in `assets/discovery/classification-baseline.json` is empty. Private
reviewed data stays outside Git. Electron's `beforePack` hook validates the file
named by `IPTVNATOR_DISCOVERY_BASELINE_FILE` and stages it only into
`dist/apps/web/assets/discovery/classification-baseline.json`. An unseeded build
always replaces any previously staged baseline with the empty manifest.

Manifest format is `{ schemaVersion: 1, baselines: [{ sourceId, version, rows }] }`.
Each entry targets an existing desktop source ID and carries a positive integer
version. Rows use that desktop source ID in both `id` and `provider.source_id`;
provider stream IDs remain unchanged. Duplicate rows from provider folders are
collapsed only after confirming their classification and provider name agree.
Connection fields, credentials, unsupported fields and duplicate IDs are rejected.

When a source first loads in Discovery, the loader finds its exact baseline and
applies it before reading saved mappings. Other sources are untouched; selecting
a new source with a different ID does not silently associate a baseline. Existing
desktop mappings always win, even if incomplete. Absent catalog streams are kept.
The importer never creates, updates or deletes a playlist or its credentials.

The existing IndexedDB version 1 `sources` store is retained. A single read/write
transaction writes the merged mappings, an original snapshot under array key
`['baseline-backup', sourceId, version]`, and receipt under
`['baseline-receipt', sourceId]`. Array keys do not collide with string source IDs.
Transactions serialize concurrent imports. An equal or higher receipt skips the
baseline; invalid existing data aborts the transaction without a receipt. Failed
imports remain retryable. New baseline versions add absent identities without
overwriting desktop edits; restoring the pre-import snapshot is a separate,
explicit recovery action.

The shared traffic-light clearance remeasures 100 ms after resize settles because
Electron can update viewport and native window widths in separate steps. Pending
measurements are cancelled when disabled or destroyed.
The main workspace header owns the desktop traffic-light clearance, drag region
and no-drag controls. Provider XMLTV channel
IDs stay in runtime metadata and are passed to the shared EPG resolver, outside
the portable classification records.

Map assets use the application HTTP client, including its XHR transport for
packaged Electron file URLs. Electron coverage verifies both world and state paths.

## Discovery controls

The left-aligned filter summary lists selected locations, categories, languages,
qualities and search text. Clearing filters resets all five dimensions. Country
availability comes from the current source mappings (or demo catalog), narrowed
by the selected region, independently of other filters. Country lists sort
alphabetically by their English display names within the selected region,
without changing the shared location inventory.

Dictionary actions live in Settings → Library; refresh lives in the shared source
menu. Source actions retain their loading, saving and capability guards.
Operation feedback carries an explicit success/error state with semantic colors
and text. The shared search retains an accessible clear button; `/` focuses it
on Discovery, and desktop Find stays on Discovery rather than opening global search.
Hovering a ribbon arrow scrolls continuously for mouse pointers; clicks and
keyboard activation still skip a page. Pointer exit, cancellation, window blur,
visibility changes and destruction cancel the animation frame.

Channel cards sort by the editable display name, case-insensitively with numeric
ordering (Channel 2 before Channel 10). Sorting affects the filtered presentation
only: source order and saved mappings stay intact. Grouping still uses channel
identity/name, and alternate streams retain their quality ranking.

The channel search field shows a slash shortcut hint while empty. Pressing `/`
from outside a text input focuses search. When text is present, an accessible
clear button replaces the hint; it clears only the query and returns focus to
search, preserving all other filter selections.

## Sports tournament shortcuts

The region selector includes Sports, replacing geography with 18 locally bundled
league-logo buttons. `discovery-leagues.ts` owns the public tournament inventory
and phrase aliases. A single selected league filters each stream by its editable
channel name or original provider name; any alias may match. Matching ignores
case, accents, punctuation and repeated whitespace, with word boundaries to keep
NBA distinct from WNBA. Country/category/language metadata is not searched for
league phrases, and a Sports classification is not required.

Entering Sports clears hidden location selections. Visible category, language,
quality and free-text filters continue to intersect with the league shortcut.
Clicking the selected league again clears it; Clear filters resets it alongside
other dimensions. Leaving Sports clears the league filter. A selected league is
validated and persisted with device preferences; restoring it reopens Sports.
The dictionary format, provider data and classification rules remain unchanged.

Logo PNGs and their source manifest live in `assets/discovery/leagues/`, sourced
from TheSportsDB's league records. Runtime browsing makes no requests to that
service; a failed image keeps the tournament label available.
