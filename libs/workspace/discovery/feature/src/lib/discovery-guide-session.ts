import { inject, Injectable, signal } from '@angular/core';
import { StreamResolverService } from '@iptvnator/portal/shared/data-access';
import {
    buildXtreamCollectionUid,
    ClassifiedStream,
} from '@iptvnator/portal/shared/util';
import { toEpgProgram } from '@iptvnator/portal/shared/ui';
import {
    ChannelIssuesService,
    EpgPreferencesService,
    SettingsStore,
} from '@iptvnator/services';
import { EpgProgram } from '@iptvnator/shared/interfaces';

@Injectable()
export class DiscoveryGuideSession {
    private readonly issues = inject(ChannelIssuesService);
    private readonly resolver = inject(StreamResolverService);
    private readonly preferences = inject(EpgPreferencesService);
    readonly enabled = this.preferences.enabled;
    readonly offsetMinutes = inject(SettingsStore).resolvedEpgOffsetMinutes;
    readonly programs = signal<EpgProgram[]>([]);
    readonly loading = signal(false);
    readonly failed = signal(false);
    private generation = 0;

    close(): void {
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
        if (!row || !this.enabled()) return;
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
                    this.resolver.loadEpgItems({
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
                    }),
                []
            );
            if (generation === this.generation && this.enabled()) {
                this.programs.set(items.map(toEpgProgram));
                if (items.length) this.issues.resolve(ref, 'epg');
                else this.issues.report(ref, 'empty-epg');
            }
        } catch {
            if (generation === this.generation && this.enabled()) {
                this.failed.set(true);
                this.issues.report(ref, 'epg-error');
            }
        } finally {
            if (generation === this.generation) this.loading.set(false);
        }
    }
}
