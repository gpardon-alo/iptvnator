import { inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
    EpgLookupUnavailableError,
    StreamResolverService,
} from '@iptvnator/portal/shared/data-access';
import {
    buildXtreamCollectionUid,
    ClassifiedStream,
} from '@iptvnator/portal/shared/util';
import { toEpgProgram } from '@iptvnator/portal/shared/ui';
import {
    ChannelIssuesService,
    EpgPreferencesService,
    EpgSourceSettingsService,
    SettingsStore,
    RuntimeCapabilitiesService,
} from '@iptvnator/services';
import { EpgProgram } from '@iptvnator/shared/interfaces';

@Injectable()
export class DiscoveryGuideSession {
    private readonly issues = inject(ChannelIssuesService);
    private readonly runtime = inject(RuntimeCapabilitiesService);
    private readonly resolver = inject(StreamResolverService);
    private readonly preferences = inject(EpgPreferencesService);
    readonly enabled = this.preferences.enabled;
    readonly offsetMinutes = inject(SettingsStore).resolvedEpgOffsetMinutes;
    readonly programs = signal<EpgProgram[]>([]);
    readonly loading = signal(false);
    readonly failed = signal(false);
    private generation = 0;
    private selection: { row: ClassifiedStream; epgChannelId?: string } | null =
        null;

    constructor() {
        inject(EpgSourceSettingsService)
            .changed$.pipe(takeUntilDestroyed())
            .subscribe(() => {
                // The host tracks enabled(); source-only changes reload here.
                const selected = this.selection;
                if (selected && this.enabled())
                    void this.load(selected.row, selected.epgChannelId);
                else this.close();
            });
    }

    close(): void {
        this.selection = null;
        this.generation++;
        this.programs.set([]);
        this.loading.set(false);
        this.failed.set(false);
    }

    async load(
        row: ClassifiedStream | null,
        epgChannelId?: string
    ): Promise<void> {
        this.close();
        if (!row || !this.enabled() || !this.runtime.supportsProviderEpg)
            return;
        this.selection = { row, epgChannelId };
        const generation = this.generation;
        const ref = {
            sourceId: row.provider.source_id,
            streamId: row.provider.stream_id,
            name: row.provider.name,
            country: row.country,
            epgId: epgChannelId,
        };
        this.loading.set(true);
        try {
            const items = await this.preferences.run(
                () =>
                    this.resolver.loadEpgItems(
                        {
                            uid: buildXtreamCollectionUid(
                                row.provider.source_id,
                                'live',
                                row.provider.stream_id
                            ),
                            sourceType: 'xtream',
                            contentType: 'live',
                            playlistId: row.provider.source_id,
                            playlistName: '',
                            xtreamId: row.provider.stream_id,
                            name: row.provider.name,
                            epgChannelId,
                        },
                        { throwOnFailure: true }
                    ),
                []
            );
            if (generation === this.generation && this.enabled()) {
                this.programs.set(items.map(toEpgProgram));
                if (items.length) this.issues.resolve(ref, 'epg');
                else this.issues.report(ref, 'empty-epg');
            }
        } catch (error) {
            if (error instanceof EpgLookupUnavailableError) return;
            if (generation === this.generation && this.enabled()) {
                this.failed.set(true);
                this.issues.report(ref, 'epg-error');
            }
        } finally {
            if (generation === this.generation) this.loading.set(false);
        }
    }
}
