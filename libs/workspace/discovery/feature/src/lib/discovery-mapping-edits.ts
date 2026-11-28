import {
    finishDiscoveryClassification,
    type ClassifiedStream,
} from '@iptvnator/portal/shared/util';
import { COUNTRIES } from './discovery-catalog';

/** Apply only edited fields to the latest transaction snapshot. */
export function mergeDiscoveryEdits(
    saved: ClassifiedStream[],
    before: ClassifiedStream[],
    edited: ClassifiedStream[]
): ClassifiedStream[] {
    const previous = new Map(before.map((row) => [row.id, row]));
    const merged = new Map(saved.map((row) => [row.id, row]));
    for (const row of edited) {
        const base = previous.get(row.id);
        const latest = merged.get(row.id);
        if (!base || !latest) {
            merged.set(row.id, row);
            continue;
        }
        if (row === base) continue;
        const next = { ...latest };
        for (const key of [
            'name',
            'country',
            'state',
            'category',
            'language',
            'quality',
            'epg',
            'origin',
            'ruleVersion',
        ] as const) {
            if (JSON.stringify(base[key]) === JSON.stringify(row[key]))
                continue;
            if (key in row) Reflect.set(next, key, row[key]);
            else Reflect.deleteProperty(next, key);
        }
        merged.set(row.id, finishDiscoveryClassification(next, COUNTRIES));
    }
    return [...merged.values()];
}
