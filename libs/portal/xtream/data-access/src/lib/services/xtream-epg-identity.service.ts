import { DictionaryEpgService } from '@iptvnator/services/dictionary-epg';
import { inject, Injectable } from '@angular/core';
import {
    buildXtreamEpgMappingKey,
    EpgItem,
} from '@iptvnator/shared/interfaces';
import { createLogger } from '@iptvnator/portal/shared/util/logger';
import { XtreamXmltvFallbackService } from './xtream-xmltv-fallback.service';
import type { EpgQueueEntry } from './epg-queue.service';

@Injectable({ providedIn: 'root' })
export class XtreamEpgIdentityService {
    private readonly dictionary = inject(DictionaryEpgService);
    private readonly fallback = inject(XtreamXmltvFallbackService);
    private readonly logger = createLogger('XtreamEpgIdentity');

    /** Retry only unresolved previews; one dictionary read per owning source. */
    async addDictionaryPreviews(
        entries: EpgQueueEntry[],
        streamsByEpgId: Map<string, number[]>,
        result: Record<string, EpgItem>
    ): Promise<void> {
        const unresolved = entries.filter(
            (e) => e.playlistId && !result[e.epgChannelId?.trim() ?? '']
        );
        const sources = [...new Set(unresolved.map((e) => e.playlistId!))];
        const mappings = new Map(
            await Promise.all(
                sources.map(
                    async (source) =>
                        [source, await this.dictionary.idsFor(source)] as const
                )
            )
        );
        const candidates: { id: string; streamId: number }[] = [];
        for (const entry of unresolved) {
            const id = mappings.get(entry.playlistId!)?.get(entry.streamId);
            if (id && id !== entry.epgChannelId?.trim())
                candidates.push({ id, streamId: entry.streamId });
        }
        if (!candidates.length) return;
        const dictionary = await this.fallback.getCurrentProgramsBatch(
            candidates.map((e) => e.id)
        );
        // Remap aliases to streams rather than overwriting a provider-ID winner.
        for (const { id, streamId } of candidates) {
            if (!dictionary[id]) continue;
            const key = `dictionary\0${streamId}`;
            streamsByEpgId.set(key, [streamId]);
            result[key] = dictionary[id];
        }
    }

    /**
     * Resolve manual EPG mappings for the queued entries.
     *
     * The user may have opened the mapping dialog (right-click → "Map EPG")
     * from any channel list; the stored key is the playlist-scoped Xtream
     * key, which does not match the provider's epg_channel_id, so the batch
     * IPC handler's resolveChannelIds() would miss it.  We resolve here,
     * upfront, so the XMLTV batch call later uses the *mapped* epgChannelId
     * — the actual EPG channel that carries the XMLTV data. A mapping also
     * supplies an epgChannelId to entries whose provider did not send one.
     */
    async resolveManualMappings(entries: EpgQueueEntry[]): Promise<void> {
        const getEpgMappingsBatch =
            typeof window.electron?.getEpgMappingsBatch === 'function'
                ? window.electron.getEpgMappingsBatch
                : null;
        if (!getEpgMappingsBatch) {
            return;
        }

        const keyByStreamId = new Map<number, string>();
        for (const entry of entries) {
            if (!entry.playlistId) continue;
            keyByStreamId.set(
                entry.streamId,
                buildXtreamEpgMappingKey(entry.playlistId, entry.streamId)
            );
        }
        if (keyByStreamId.size === 0) {
            return;
        }

        try {
            // One IPC round-trip for the whole viewport — a per-entry
            // lookup would put O(N) IPC calls on every scroll event.
            const mappings = await getEpgMappingsBatch([
                ...keyByStreamId.values(),
            ]);
            for (const entry of entries) {
                const key = keyByStreamId.get(entry.streamId);
                const mapped = key ? mappings[key]?.trim() : undefined;
                if (mapped) {
                    this.logger.info(
                        `Mapped stream ${entry.streamId}: ${entry.epgChannelId ?? '(none)'} → ${mapped}`
                    );
                    entry.epgChannelId = mapped;
                }
            }
        } catch {
            // Mapping lookup failure is non-fatal; keep the original
            // epgChannelId values and proceed.
        }
    }
}
