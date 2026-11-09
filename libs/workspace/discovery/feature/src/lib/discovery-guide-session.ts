import { inject, Injectable, signal } from '@angular/core';
import { StreamResolverService } from '@iptvnator/portal/shared/data-access';
import {
    buildXtreamCollectionUid,
    ClassifiedStream,
} from '@iptvnator/portal/shared/util';
import { toEpgProgram } from '@iptvnator/portal/shared/ui';
import { EpgPreferencesService, SettingsStore } from '@iptvnator/services';
import { EpgProgram } from '@iptvnator/shared/interfaces';

@Injectable()
export class DiscoveryGuideSession {
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

    async load(row: ClassifiedStream | null): Promise<void> {
        this.close();
        if (!row || !this.enabled()) return;
        const generation = this.generation;
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
                    }),
                []
            );
            if (generation === this.generation)
                this.programs.set(items.map(toEpgProgram));
        } catch {
            if (generation === this.generation) this.failed.set(true);
        } finally {
            if (generation === this.generation) this.loading.set(false);
        }
    }
}
