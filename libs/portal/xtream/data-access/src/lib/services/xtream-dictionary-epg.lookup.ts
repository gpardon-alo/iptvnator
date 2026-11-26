import { Injector } from '@angular/core';
import { DictionaryEpgService } from '@iptvnator/services/dictionary-epg';
import { resolveEpgFallback } from '@iptvnator/portal/shared/util/epg';
import type { EpgItem } from '@iptvnator/shared/interfaces';

/** Load the EPG identity waterfall on demand, keeping it off the startup path. */
export function resolveXtreamEpg(
    injector: Injector,
    args: {
        epgChannelId: string | null | undefined;
        playlistId?: string;
        streamId?: number;
        preferUploaded: boolean;
        fetchProvider: () => Promise<EpgItem[]>;
    },
    fetchXmltv: (id: string) => Promise<EpgItem[]>
): Promise<EpgItem[]> {
    return resolveEpgFallback({
        ...args,
        fetchBackup: async () => {
            const id = (args.epgChannelId ?? '').trim();
            const primary = id ? await fetchXmltv(id) : [];
            if (primary.length) return primary;
            if (!args.playlistId || args.streamId == null) return [];
            const dictionaryId = (
                await injector.get(DictionaryEpgService).idsFor(args.playlistId)
            ).get(args.streamId);
            return dictionaryId && dictionaryId !== id
                ? fetchXmltv(dictionaryId)
                : [];
        },
    });
}
