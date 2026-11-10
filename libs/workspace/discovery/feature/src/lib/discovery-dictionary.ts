import {
    CLASSIFICATION_GENRES,
    finishDiscoveryClassification,
    parseDiscoveryBaseline,
    type ClassifiedStream,
} from '@iptvnator/portal/shared/util';
import { COUNTRIES } from './discovery-catalog';

/** Messages contain only fixed field names and row numbers, never imported data. */
export class DictionaryImportError extends Error {}

/** Imports use the exported array; summaries are rebuilt after manual edits. */
export function parseDiscoveryDictionary(
    text: string,
    sourceId: string,
    current: ClassifiedStream[]
): ClassifiedStream[] {
    let input: unknown;
    try {
        input = JSON.parse(text);
    } catch {
        throw new DictionaryImportError('The file is not valid JSON.');
    }
    if (!Array.isArray(input))
        throw new DictionaryImportError(
            'The dictionary must be a JSON array exported from Classifications.'
        );
    const providers = new Map(current.map((row) => [row.id, row.provider]));
    const unique = new Map<string, ClassifiedStream>();
    const signatures = new Map<string, string>();
    input.forEach((value, index) => {
        let row: ClassifiedStream;
        try {
            row = parseDiscoveryBaseline({
                schemaVersion: 1,
                baselines: [{ sourceId, version: 1, rows: [value] }],
            }).baselines[0].rows[0];
        } catch {
            throw new DictionaryImportError(
                `Entry ${index + 1} has invalid fields or does not match the selected source. Keep exported IDs and the dictionary structure unchanged.`
            );
        }
        if (row.country && !COUNTRIES.some((c) => c.id === row.country))
            throw new DictionaryImportError(
                `Entry ${index + 1} has an unsupported country code.`
            );
        if (
            row.category &&
            !CLASSIFICATION_GENRES.some((c) => c[0] === row.category)
        )
            throw new DictionaryImportError(
                `Entry ${index + 1} has an unsupported category. Use a category ID such as news or sports, or an empty string.`
            );
        if (
            row.provider.category_name !== undefined &&
            typeof row.provider.category_name !== 'string'
        )
            throw new DictionaryImportError(
                `Entry ${index + 1} has an invalid provider category name.`
            );
        const signature = JSON.stringify([
            row.name.trim(),
            row.country,
            row.state || '',
            row.category,
            row.language,
            row.quality ?? 'Unknown',
            row.provider.name,
        ]);
        if (signatures.has(row.id) && signatures.get(row.id) !== signature)
            throw new DictionaryImportError(
                `Entry ${index + 1} repeats a stream ID with conflicting names or classifications. Keep one corrected entry for that ID.`
            );
        signatures.set(row.id, signature);
        if (!unique.has(row.id))
            unique.set(
                row.id,
                finishDiscoveryClassification(
                    {
                        ...row,
                        name: row.name.trim(),
                        origin: 'manual',
                        provider: providers.get(row.id) ?? row.provider,
                    },
                    COUNTRIES
                )
            );
    });
    return [...unique.values()];
}

/** Match the visible catalog's first occurrence of each source-scoped ID. */
export function discoveryDictionaryRows(
    rows: ClassifiedStream[]
): ClassifiedStream[] {
    const unique = new Map<string, ClassifiedStream>();
    rows.forEach((row) => {
        if (!unique.has(row.id)) unique.set(row.id, row);
    });
    return [...unique.values()];
}

export function downloadDiscoveryDictionary(rows: ClassifiedStream[]): void {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(discoveryDictionaryRows(rows), null, 2)], {
            type: 'application/json',
        })
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'discovery-classifications.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
