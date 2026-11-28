import { inject, Injectable, Injector } from '@angular/core';
import {
    EpgItem,
    EpgProgram,
    epgProviderClockMs,
} from '@iptvnator/shared/interfaces';
import { createLogger } from '@iptvnator/portal/shared/util/logger';
import {
    EpgPreferencesService,
    EpgSourceSettingsService,
    SettingsStore,
} from '@iptvnator/services';

type ElectronEpgBridge = {
    getChannelPrograms?: (channelId: string) => Promise<EpgProgram[]>;
    getCurrentProgramsBatch?: (
        channelIds: string[],
        options?: { nowMs?: number }
    ) => Promise<Record<string, EpgProgram | null>>;
};

@Injectable({ providedIn: 'root' })
export class XtreamXmltvFallbackService {
    private readonly injector = inject(Injector);
    private readonly logger = createLogger('XtreamXmltvFallback');
    private readonly settingsStore = inject(SettingsStore);
    private readonly sources = inject(EpgSourceSettingsService);
    private readonly preferences = inject(EpgPreferencesService);

    /**
     * `DataService.isElectron` is intentionally not consulted here: it
     * checks `window.process?.type`, which contextBridge isolation hides
     * from the renderer. Each method below gates on the specific bridge
     * function it needs, so a partial preload (e.g. `getChannelPrograms`
     * present but `getCurrentProgramsBatch` missing) only disables the
     * affected path.
     */
    private get bridge(): ElectronEpgBridge | null {
        if (typeof window === 'undefined') return null;
        const candidate = (
            window as unknown as { electron?: ElectronEpgBridge }
        ).electron;
        return candidate ?? null;
    }

    /**
     * Returns the full schedule for a channel from local XMLTV, mapped into
     * the `EpgItem` shape the Xtream UI consumes. Returns `[]` when nothing
     * is found or the bridge function is unavailable.
     */
    async getProgramsForChannel(
        epgChannelId: string | null | undefined
    ): Promise<EpgItem[]> {
        if (!this.preferences.enabled()) return [];
        const revision = this.sources.revision();
        const id = (epgChannelId ?? '').trim();
        if (!id) return [];

        const fn = this.bridge?.getChannelPrograms;
        if (typeof fn !== 'function') return [];

        try {
            const programs = await fn.call(this.bridge, id);
            const { mapEpgProgramToEpgItem } =
                await import('./xtream-epg-program.mapper');
            if (revision !== this.sources.revision()) return [];
            return (programs ?? []).map((p) => mapEpgProgramToEpgItem(p, id));
        } catch (error) {
            this.logger.error(`Failed to load XMLTV programs for ${id}`, error);
            return [];
        }
    }

    async getCurrentProgramsBatch(
        epgChannelIds: ReadonlyArray<string | null | undefined>
    ): Promise<Record<string, EpgItem>> {
        if (!this.preferences.enabled()) return {};
        const revision = this.sources.revision();
        const fn = this.bridge?.getCurrentProgramsBatch;
        if (typeof fn !== 'function') return {};

        const ids = Array.from(
            new Set(
                epgChannelIds
                    .map((id) => (id ?? '').trim())
                    .filter((id): id is string => id.length > 0)
            )
        );
        if (ids.length === 0) return {};

        try {
            // "Now" in the provider's EPG clock (`epg-display-offset.util.ts`,
            // clock form), like every other current-programme lookup.
            const rows = await fn.call(this.bridge, ids, {
                nowMs: epgProviderClockMs(
                    Date.now(),
                    this.settingsStore.resolvedEpgOffsetMinutes()
                ),
            });
            const { mapEpgProgramToEpgItem } =
                await import('./xtream-epg-program.mapper');
            if (revision !== this.sources.revision()) return {};
            const out: Record<string, EpgItem> = {};
            for (const id of ids) {
                const row = rows?.[id];
                if (row) {
                    out[id] = mapEpgProgramToEpgItem(row, id);
                }
            }
            return out;
        } catch (error) {
            this.logger.error(
                'Failed to load XMLTV current-programs batch',
                error
            );
            return {};
        }
    }

    /**
     * Resolve EPG for a single channel under the user's source-priority
     * setting. The Xtream provider's call is supplied by the caller via
     * `fetchProvider` so this service stays unaware of credentials. When
     * `preferUploaded` is true and XMLTV has data, the provider is not
     * called at all.
     */
    async resolveCurrentEpg(args: {
        epgChannelId: string | null | undefined;
        playlistId?: string;
        streamId?: number;
        preferUploaded: boolean;
        fetchProvider: () => Promise<EpgItem[]>;
    }): Promise<EpgItem[]> {
        const revision = this.sources.revision();
        const { resolveXtreamEpg } =
            await import('./xtream-dictionary-epg.lookup');
        const result = await resolveXtreamEpg(this.injector, args, (id) =>
            this.getProgramsForChannel(id)
        );
        return revision === this.sources.revision() ? result : [];
    }
}
