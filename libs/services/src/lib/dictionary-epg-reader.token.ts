import { InjectionToken } from '@angular/core';

export interface DictionaryEpgRow {
    provider: { source_id: string; stream_id: number };
    epg?: { xmltvId?: string };
}

/** The app supplies lazy access to portable dictionary storage. */
export const READ_EPG_DICTIONARY = new InjectionToken<
    (sourceId: string) => Promise<DictionaryEpgRow[]>
>('READ_EPG_DICTIONARY', { providedIn: 'root', factory: () => async () => [] });
