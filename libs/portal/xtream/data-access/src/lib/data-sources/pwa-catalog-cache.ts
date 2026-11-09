import type { XtreamApiService } from '../services/xtream-api.service';
import type {
    XtreamContentItem,
    XtreamOperationOptions,
} from './xtream-data-source.interface';
import { Injectable } from '@angular/core';
import { loadStalkerProtocolHash } from '@iptvnator/shared/interfaces';
import { sourceProfileName } from '@iptvnator/services/source-sync/connection';
import type { XtreamCredentials } from '../services/xtream-api.service';
import { catalogStorage } from './pwa-catalog-storage';

export const PWA_CATALOG_TTL = 24 * 60 * 60 * 1000;
interface Entry {
    connection: string;
    fetchedAt: number;
    rows: unknown[];
}

/** Optional, disposable catalog persistence. A storage failure never blocks playback. */
@Injectable({ providedIn: 'root' })
export class PwaCatalogCache {
    private readonly storage = catalogStorage(sourceProfileName());
    private readonly entries = new Map<string, Entry>();
    private readonly generations = new Map<string, number>();
    private readonly pending = new Map<string, Promise<unknown[]>>();

    loadContent(
        playlistId: string,
        credentials: XtreamCredentials,
        type: 'live' | 'movie' | 'series',
        api: XtreamApiService,
        options?: XtreamOperationOptions,
        currentRows?: (
            rows: XtreamContentItem[]
        ) => XtreamContentItem[] | undefined
    ): Promise<XtreamContentItem[]> {
        return this.load(
            playlistId,
            `${type}-content`,
            credentials,
            async () => {
                options?.onPhaseChange?.(
                    type === 'live'
                        ? 'loading-live'
                        : type === 'movie'
                          ? 'loading-movies'
                          : 'loading-series'
                );
                options?.signal?.throwIfAborted();
                const streams = await api.getStreams(
                    credentials,
                    type,
                    ...(options?.signal ? [{ signal: options.signal }] : [])
                );
                const { normalizePwaCatalogContent } =
                    await import('./pwa-content-metadata');
                return normalizePwaCatalogContent(streams, type);
            },
            options?.signal,
            currentRows
        );
    }

    async load<T>(
        playlistId: string,
        slot: string,
        credentials: XtreamCredentials,
        fetch: () => Promise<T[]>,
        signal?: AbortSignal,
        currentRows?: (validatedRows: T[]) => T[] | undefined
    ): Promise<T[]> {
        const generation = this.generations.get(playlistId) ?? 0;
        const { hashStalkerProtocolValue, STALKER_HASH_ALGORITHM } =
            await loadStalkerProtocolHash();
        const connection = await hashStalkerProtocolValue(
            JSON.stringify([
                credentials.serverUrl,
                credentials.username,
                credentials.password,
                credentials.userAgent ?? '',
            ]),
            STALKER_HASH_ALGORITHM.SHA256
        );
        const key = `${playlistId}:${slot}`;
        // Requests with their own abort signal retain independent cancellation ownership.
        const pendingKey = `${key}:${connection}:${generation}`;
        const operation = async () => {
            let entry = this.entries.get(key);
            if (!entry) {
                try {
                    entry = (await this.storage.read(key)) as Entry;
                } catch {
                    /* optional cache */
                }
            }
            signal?.throwIfAborted();
            this.assertCurrent(playlistId, generation);
            const age = Date.now() - (entry?.fetchedAt ?? NaN);
            if (
                entry?.connection === connection &&
                Array.isArray(entry.rows) &&
                age >= 0 &&
                age < PWA_CATALOG_TTL
            ) {
                this.entries.set(key, entry);
                return currentRows?.(entry.rows as T[]) ?? (entry.rows as T[]);
            }
            const rows = await fetch();
            signal?.throwIfAborted();
            this.assertCurrent(playlistId, generation);
            const next = { connection, fetchedAt: Date.now(), rows };
            this.entries.set(key, next);
            try {
                await this.storage.write(
                    key,
                    next,
                    () => (this.generations.get(playlistId) ?? 0) === generation
                );
            } catch {
                /* quota/private mode: session cache */
            }
            signal?.throwIfAborted();
            this.assertCurrent(playlistId, generation);
            return rows;
        };
        if (signal) return operation();
        let pending = this.pending.get(pendingKey);
        if (!pending) {
            pending = operation().finally(() =>
                this.pending.delete(pendingKey)
            );
            this.pending.set(pendingKey, pending);
        }
        return pending as Promise<T[]>;
    }

    clearSession(playlistId: string): void {
        this.generations.set(
            playlistId,
            (this.generations.get(playlistId) ?? 0) + 1
        );
        for (const key of this.entries.keys()) {
            if (key.startsWith(`${playlistId}:`)) this.entries.delete(key);
        }
    }

    async clear(playlistId: string): Promise<void> {
        this.clearSession(playlistId);
        // Unlike an optional write, explicit refresh must not silently reuse old storage.
        await this.storage.remove(playlistId);
    }

    private assertCurrent(playlistId: string, generation: number): void {
        if ((this.generations.get(playlistId) ?? 0) !== generation)
            throw new DOMException('Catalog request superseded', 'AbortError');
    }
}
