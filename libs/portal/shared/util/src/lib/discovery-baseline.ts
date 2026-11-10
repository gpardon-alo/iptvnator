import {
    discoveryStreamId,
    DISCOVERY_QUALITIES,
    type ClassifiedStream,
} from './discovery-classification';
import { discoveryState } from './discovery-us-states';

export interface DiscoveryBaseline {
    sourceId: string;
    version: number;
    rows: ClassifiedStream[];
}
export interface DiscoveryBaselineManifest {
    schemaVersion: 1;
    baselines: DiscoveryBaseline[];
}

/** Validate persisted data without repairing or discarding unreadable records. */
export function assertDiscoveryMappings(
    value: unknown,
    sourceId: string
): asserts value is ClassifiedStream[] {
    if (
        !Array.isArray(value) ||
        value.some(
            (row) =>
                !row ||
                typeof row.name !== 'string' ||
                !row.name.trim() ||
                row.provider?.source_id !== sourceId ||
                !Number.isSafeInteger(row.provider?.stream_id) ||
                row.provider.stream_id <= 0 ||
                typeof row.provider.name !== 'string' ||
                !row.provider.name ||
                row.id !==
                    discoveryStreamId(sourceId, row.provider.stream_id) ||
                !['country', 'category', 'language'].every(
                    (field) => typeof row[field] === 'string'
                ) ||
                (row.state !== undefined &&
                    (typeof row.state !== 'string' ||
                        (row.state &&
                            (row.country !== 'US' || !discoveryState(row))))) ||
                (row.quality !== undefined &&
                    !DISCOVERY_QUALITIES.includes(row.quality)) ||
                !Array.isArray(row.categories) ||
                !row.categories.every((v: unknown) => typeof v === 'string') ||
                !['classified', 'unclassified'].includes(row.status) ||
                !Number.isSafeInteger(row.ruleVersion) ||
                row.ruleVersion < 0 ||
                !['manual', 'rules'].includes(row.origin)
        )
    )
        throw new Error('Classification storage needs recovery');
}

function exactKeys(value: object, allowed: string[]): boolean {
    return Object.keys(value).every((key) => allowed.includes(key));
}

/** Baselines have no connection/credential fields and target an explicit source ID. */
export function parseDiscoveryBaseline(
    value: unknown
): DiscoveryBaselineManifest {
    const manifest = value as DiscoveryBaselineManifest;
    if (
        !manifest ||
        manifest.schemaVersion !== 1 ||
        !Array.isArray(manifest.baselines) ||
        !exactKeys(manifest, ['schemaVersion', 'baselines'])
    )
        throw new Error('Invalid classification baseline');
    const sources = new Set<string>();
    for (const baseline of manifest.baselines) {
        if (
            !baseline ||
            typeof baseline.sourceId !== 'string' ||
            !baseline.sourceId ||
            !Number.isSafeInteger(baseline.version) ||
            baseline.version < 1 ||
            sources.has(baseline.sourceId) ||
            !exactKeys(baseline, ['sourceId', 'version', 'rows'])
        )
            throw new Error('Invalid classification baseline identity');
        assertDiscoveryMappings(baseline.rows, baseline.sourceId);
        const ids = new Set<string>();
        for (const row of baseline.rows) {
            if (
                ids.has(row.id) ||
                !exactKeys(row, [
                    'id',
                    'name',
                    'categories',
                    'provider',
                    'country',
                    'state',
                    'category',
                    'language',
                    'quality',
                    'status',
                    'origin',
                    'ruleVersion',
                ]) ||
                !exactKeys(row.provider, [
                    'source_id',
                    'stream_id',
                    'name',
                    'category_name',
                ])
            )
                throw new Error('Duplicate or unsupported baseline fields');
            ids.add(row.id);
        }
        sources.add(baseline.sourceId);
    }
    return manifest;
}

/** Existing records, including incomplete manual edits, always take precedence. */
export function mergeDiscoveryBaseline(
    saved: ClassifiedStream[],
    baseline: DiscoveryBaseline
): ClassifiedStream[] {
    const merged = new Map(baseline.rows.map((row) => [row.id, row]));
    saved.forEach((row) => merged.set(row.id, row));
    return [...merged.values()];
}
