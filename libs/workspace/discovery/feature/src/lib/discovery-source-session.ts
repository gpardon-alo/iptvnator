import {
    computed,
    effect,
    inject,
    Injectable,
    signal,
    untracked,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { selectAllPlaylistsMeta } from '@iptvnator/m3u-state';
import {
    DiscoveryBaselineImport,
    DiscoveryMappingStorage,
} from '@iptvnator/portal/shared/data-access';
import {
    classifyDiscoveryStream,
    discoveryMissingFields,
    discoverySuggestedLanguage,
    finishDiscoveryClassification,
    reconcileDiscoveryMappings,
    type ClassifiedStream,
} from '@iptvnator/portal/shared/util';
import {
    XTREAM_DATA_SOURCE,
    type XtreamContentItem,
} from '@iptvnator/portal/xtream/data-access';
import { ParentalLockService } from '@iptvnator/services';
import { sourceProfileName } from '@iptvnator/services/source-sync/connection';
import {
    COUNTRIES,
    DEMO_CHANNELS,
    type DemoChannel,
} from './discovery-catalog';
import { groupDiscoveryChannels } from './discovery-channel-groups';
import {
    DictionaryImportError,
    downloadDiscoveryDictionary,
    parseDiscoveryDictionary,
} from './discovery-dictionary';

@Injectable()
export class DiscoverySourceSession {
    private readonly data = inject(XTREAM_DATA_SOURCE);
    private readonly parentalLock = inject(ParentalLockService);
    private readonly storage = inject(DiscoveryMappingStorage);
    private readonly baseline = inject(DiscoveryBaselineImport);
    private readonly playlists = inject(Store).selectSignal(
        selectAllPlaylistsMeta
    );
    private readonly selectionKey = `${sourceProfileName()}:discovery-source-v1`;
    readonly sources = computed(() =>
        this.playlists().filter(
            (p) =>
                p.serverUrl &&
                (!p.xtreamContentTypes || p.xtreamContentTypes.includes('live'))
        )
    );
    readonly sourceId = signal(this.readSelection());
    readonly rows = signal<ClassifiedStream[]>([]);
    readonly loading = signal(false);
    readonly saving = signal(false);
    readonly error = signal('');
    readonly notice = signal('');
    readonly unclassified = computed(() =>
        this.rows().filter((r) => !r.category)
    );
    readonly needsReview = computed(() =>
        this.rows().filter((r) => discoveryMissingFields(r).length > 0)
    );
    readonly pending = computed(
        () => this.rows().filter((r) => r.ruleVersion === 0).length
    );
    readonly missingLanguagesWithDefault = computed(() =>
        this.rows().filter(
            (row) => !row.language && discoverySuggestedLanguage(row)
        )
    );
    readonly channels = computed<DemoChannel[]>(() =>
        !this.sourceId()
            ? DEMO_CHANNELS
            : groupDiscoveryChannels(this.rows(), this.logos())
    );
    readonly epgChannelIds = signal(new Map<number, string>());
    private saved: ClassifiedStream[] = [];
    private readonly logos = signal(new Map<number, string>());
    private generation = 0;
    private activeSource = '';

    constructor() {
        let lockVersion = this.parentalLock.version();
        effect(() => {
            const version = this.parentalLock.version();
            const id = this.sourceId();
            const source = this.sources().find((s) => s._id === id);
            untracked(() => {
                if (version !== lockVersion) {
                    lockVersion = version;
                    this.generation++;
                    this.activeSource = '';
                    this.rows.set([]);
                    this.loading.set(false);
                }
                if (id && source && this.activeSource !== id)
                    void this.load(id);
            });
        });
    }
    private readSelection(): string {
        try {
            return localStorage.getItem(this.selectionKey) ?? '';
        } catch {
            return '';
        }
    }
    select(id: string): void {
        if (this.saving()) return;
        this.generation++;
        this.activeSource = '';
        this.rows.set([]);
        this.error.set('');
        this.notice.set('');
        this.loading.set(false);
        this.sourceId.set(id);
        try {
            localStorage.setItem(this.selectionKey, id);
        } catch {
            /* optional preference */
        }
    }
    async load(id = this.sourceId()): Promise<void> {
        if (!id) return;
        const generation = ++this.generation;
        this.activeSource = id;
        this.loading.set(true);
        this.error.set('');
        this.notice.set('');
        try {
            const playlist = await this.data.getPlaylist(id);
            if (!playlist) throw new Error('Source unavailable');
            const categories = await this.data.getCategories(
                id,
                playlist,
                'live'
            );
            if (generation !== this.generation) return;
            const [items, saved] = await Promise.all([
                this.data.getContent(id, playlist, 'live'),
                this.baseline.apply(id).then(() => this.storage.read(id)),
            ]);
            if (generation !== this.generation) return;
            this.epgChannelIds.set(
                new Map(
                    items.map((item) => {
                        const content = item as Partial<XtreamContentItem>;
                        return [
                            Number(content.xtream_id ?? content.stream_id),
                            content.epg_channel_id ?? '',
                        ];
                    })
                )
            );
            this.logos.set(
                new Map(
                    items.map((item) => {
                        const content = item as Partial<XtreamContentItem>;
                        return [
                            Number(content.xtream_id ?? content.stream_id),
                            content.poster_url || content.stream_icon || '',
                        ];
                    })
                )
            );
            const folders = new Map(
                categories.map((c) =>
                    'category_id' in c
                        ? [String(c.category_id), c.category_name]
                        : [String(c.id), c.name]
                )
            );
            const providers = items
                .map((item) => {
                    const content = item as Partial<XtreamContentItem>;
                    return {
                        source_id: id,
                        stream_id: Number(
                            content.xtream_id ?? content.stream_id
                        ),
                        name: content.title ?? content.name ?? '',
                        category_name: folders.get(String(content.category_id)),
                    };
                })
                .filter(
                    (p) =>
                        Number.isSafeInteger(p.stream_id) &&
                        p.stream_id > 0 &&
                        p.name
                );
            this.saved = saved;
            this.rows.set(
                reconcileDiscoveryMappings(providers, saved, COUNTRIES)
            );
        } catch {
            if (generation === this.generation)
                this.error.set(
                    'Could not load this source or its saved mappings. Retry without clearing your data.'
                );
        } finally {
            if (generation === this.generation) this.loading.set(false);
        }
    }
    async classifyUnclassified(): Promise<void> {
        const next = this.rows().map((row) =>
            discoveryMissingFields(row).length > 0 && row.origin !== 'manual'
                ? {
                      ...classifyDiscoveryStream(row.provider, COUNTRIES),
                      ...(row.quality ? { quality: row.quality } : {}),
                  }
                : row
        );
        await this.save(next);
    }
    async edit(row: ClassifiedStream): Promise<void> {
        const next = finishDiscoveryClassification(
            { ...row, origin: 'manual', ruleVersion: 1 },
            COUNTRIES
        );
        await this.save(this.rows().map((r) => (r.id === row.id ? next : r)));
    }
    async fillMissingLanguages(): Promise<void> {
        if (!this.missingLanguagesWithDefault().length) return;
        const next = this.rows().map((row) => {
            const language = discoverySuggestedLanguage(row);
            return row.language || !language
                ? row
                : finishDiscoveryClassification(
                      { ...row, language },
                      COUNTRIES
                  );
        });
        await this.save(next);
    }
    async reclassify(row: ClassifiedStream): Promise<void> {
        const next = {
            ...classifyDiscoveryStream(row.provider, COUNTRIES),
            ...(row.quality ? { quality: row.quality } : {}),
        };
        await this.save(this.rows().map((r) => (r.id === row.id ? next : r)));
    }
    private async save(rows: ClassifiedStream[]): Promise<void> {
        if (this.saving() || this.loading() || this.error() || !this.sourceId())
            return;
        const id = this.sourceId();
        const generation = this.generation;
        this.saving.set(true);
        this.notice.set('');
        try {
            // Retain absent streams so a later catalog can restore their custom mapping.
            const merged = new Map(this.saved.map((row) => [row.id, row]));
            rows.forEach((row) => merged.set(row.id, row));
            const saved = [...merged.values()];
            await this.storage.write(id, saved);
            if (generation !== this.generation) return;
            this.saved = saved;
            this.rows.set(rows);
            this.notice.set('Mappings saved on this device.');
        } catch {
            this.notice.set(
                'Could not save mappings. Your previous saved version is retained; please retry.'
            );
        } finally {
            this.saving.set(false);
        }
    }
    async importDictionary(file: File): Promise<void> {
        if (this.saving() || this.loading() || this.error() || !this.sourceId())
            return;
        const id = this.sourceId();
        const generation = this.generation;
        this.saving.set(true);
        this.notice.set('Reading dictionary…');
        let validated = false;
        try {
            if (file.size > 32 * 1024 * 1024)
                throw new DictionaryImportError(
                    'The dictionary exceeds the 32 MiB limit.'
                );
            const text = await file.text();
            if (generation !== this.generation) return;
            const imported = parseDiscoveryDictionary(text, id, this.rows());
            const changes = new Map(imported.map((row) => [row.id, row]));
            const rows = this.rows().map((row) => changes.get(row.id) ?? row);
            const merged = new Map(this.saved.map((row) => [row.id, row]));
            rows.forEach((row) => merged.set(row.id, row));
            imported.forEach((row) => merged.set(row.id, row));
            const saved = [...merged.values()];
            validated = true;
            await this.storage.write(id, saved);
            if (generation !== this.generation) return;
            this.saved = saved;
            this.rows.set(rows);
            this.notice.set(
                `Imported ${imported.length} dictionary mappings on this device.`
            );
        } catch (error) {
            if (generation === this.generation)
                this.notice.set(
                    validated
                        ? 'Could not save dictionary. Previous mappings are retained; please retry.'
                        : `Could not import dictionary. ${error instanceof DictionaryImportError ? error.message : 'The file could not be read. Try selecting it again.'} Previous mappings are retained.`
                );
        } finally {
            this.saving.set(false);
        }
    }
    download(): void {
        downloadDiscoveryDictionary(this.rows());
    }
}
