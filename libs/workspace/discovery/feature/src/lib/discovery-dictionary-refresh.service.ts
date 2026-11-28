import { inject, Injectable } from '@angular/core';
import {
    DiscoveryDictionaryDownload,
    DiscoveryDictionaryUrlStorage,
    DiscoveryMappingStorage,
} from '@iptvnator/portal/shared/data-access';
import { reconcileDiscoveryMappings } from '@iptvnator/portal/shared/util';
import {
    XTREAM_DATA_SOURCE,
    type XtreamContentItem,
} from '@iptvnator/portal/xtream/data-access';
import { COUNTRIES } from './discovery-catalog';
import { parseDiscoveryDictionary } from './discovery-dictionary';

/** Reuses the Dictionary page's validation, without requiring that page open. */
@Injectable({ providedIn: 'root' })
export class DiscoveryDictionaryRefreshService {
    private readonly urls = inject(DiscoveryDictionaryUrlStorage);
    private readonly download = inject(DiscoveryDictionaryDownload);
    private readonly storage = inject(DiscoveryMappingStorage);
    private readonly data = inject(XTREAM_DATA_SOURCE);

    async refresh(
        id: string,
        isCurrent: () => Promise<boolean>
    ): Promise<void> {
        const url = this.urls.read(id).trim();
        if (!url) return;
        const text = await (await this.download.download(url)).text();
        if (!(await isCurrent()) || this.urls.read(id).trim() !== url) return;
        const playlist = await this.data.getPlaylist(id);
        if (!playlist) return;
        const [categories, items] = await Promise.all([
            this.data.getCategories(id, playlist, 'live'),
            this.data.getContent(id, playlist, 'live'),
        ]);
        const folders = new Map(
            categories.map((category) =>
                'category_id' in category
                    ? [String(category.category_id), category.category_name]
                    : [String(category.id), category.name]
            )
        );
        const providers = items
            .map((item) => {
                const row = item as Partial<XtreamContentItem>;
                return {
                    source_id: id,
                    stream_id: Number(row.xtream_id ?? row.stream_id),
                    name: row.title ?? row.name ?? '',
                    category_name: folders.get(String(row.category_id)),
                };
            })
            .filter(
                (row) =>
                    Number.isSafeInteger(row.stream_id) &&
                    row.stream_id > 0 &&
                    row.name
            );
        const imported = parseDiscoveryDictionary(
            text,
            id,
            reconcileDiscoveryMappings(providers, [], COUNTRIES)
        );
        if (!(await isCurrent()) || this.urls.read(id).trim() !== url) return;
        await this.storage.update(id, (saved) => {
            // Opening IndexedDB is asynchronous; a manual URL import may have
            // replaced the preference since the ownership check above.
            if (this.urls.read(id).trim() !== url) return saved;
            const merged = new Map(saved.map((row) => [row.id, row]));
            for (const row of imported) {
                const previous = merged.get(row.id)?.epg;
                const epg =
                    previous || row.epg
                        ? { ...previous, ...row.epg }
                        : undefined;
                merged.set(row.id, { ...row, ...(epg ? { epg } : {}) });
            }
            return [...merged.values()];
        });
    }
}
