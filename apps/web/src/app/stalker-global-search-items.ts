import {
    firstNonBlankStalkerIdText,
    withoutWithheldStalkerItems,
    type StalkerVodSource,
} from '@iptvnator/portal/stalker/data-access';
import { isStalkerSeriesItem } from '@iptvnator/shared/interfaces';
import type {
    StalkerGlobalSearchContext,
    StalkerGlobalSearchItem,
} from './stalker-global-search.models';

export function appendStalkerSearchItems(
    existing: readonly StalkerGlobalSearchItem[],
    job: Pick<StalkerGlobalSearchItem, 'playlistId' | 'origin'>,
    criteria: Pick<StalkerGlobalSearchContext, 'movies' | 'series'>,
    rawItems: StalkerVodSource[],
    withheld: ReadonlySet<string>
): StalkerGlobalSearchItem[] {
    const { playlistId, origin } = job;
    const items = [...existing];
    const keys = new Set(items.map(({ key }) => key));
    for (const item of withoutWithheldStalkerItems(
        rawItems,
        origin,
        withheld
    )) {
        const series = origin === 'series' || isStalkerSeriesItem(item);
        if (series ? !criteria.series : !criteria.movies) {
            continue;
        }
        const displayType = series ? 'series' : 'movie';
        const id = firstNonBlankStalkerIdText(
            item.id,
            item.stream_id,
            item.movie_id,
            item.series_id
        );
        const key = JSON.stringify([playlistId, origin, id]);
        if (id && !keys.has(key)) {
            keys.add(key);
            items.push({ playlistId, origin, id, displayType, item, key });
        }
    }
    return items;
}
