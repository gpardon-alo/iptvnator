import { inject, Injectable } from '@angular/core';
import { READ_EPG_DICTIONARY } from './dictionary-epg-reader.token';
export { READ_EPG_DICTIONARY } from './dictionary-epg-reader.token';

@Injectable({ providedIn: 'root' })
export class DictionaryEpgService {
    private readonly read = inject(READ_EPG_DICTIONARY);

    /** One read per source per batch, never a global stream-ID/name match. */
    async idsFor(sourceId: string): Promise<Map<number, string>> {
        try {
            const rows = await this.read(sourceId);
            const ids = new Map<number, string>();
            for (const row of rows) {
                const id = row.epg?.xmltvId?.trim();
                if (id && row.provider.source_id === sourceId)
                    ids.set(row.provider.stream_id, id);
            }
            return ids;
        } catch {
            // Unavailable/corrupt dictionary storage cannot disable provider EPG.
            return new Map();
        }
    }
}
