'use strict';

const fs = require('node:fs');
const path = require('node:path');

const only = (value, keys) =>
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => keys.includes(key));

/** Fail closed on credentials, wrong source identity or duplicate stream records. */
function validateBaseline(manifest) {
    if (
        !only(manifest, ['schemaVersion', 'baselines']) ||
        manifest.schemaVersion !== 1 ||
        !Array.isArray(manifest.baselines)
    )
        throw new Error('Invalid classification baseline manifest');
    const sources = new Set();
    for (const entry of manifest.baselines) {
        if (
            !only(entry, ['sourceId', 'version', 'rows']) ||
            typeof entry.sourceId !== 'string' ||
            !entry.sourceId ||
            sources.has(entry.sourceId) ||
            !Number.isSafeInteger(entry.version) ||
            entry.version < 1 ||
            !Array.isArray(entry.rows)
        )
            throw new Error('Invalid baseline source or version');
        sources.add(entry.sourceId);
        const ids = new Set();
        for (const row of entry.rows) {
            if (
                !only(row, [
                    'id',
                    'name',
                    'categories',
                    'provider',
                    'country',
                    'state',
                    'category',
                    'language',
                    'status',
                    'origin',
                    'ruleVersion',
                ]) ||
                !only(row.provider, [
                    'source_id',
                    'stream_id',
                    'name',
                    'category_name',
                ]) ||
                row.provider.source_id !== entry.sourceId ||
                !Number.isSafeInteger(row.provider.stream_id) ||
                row.provider.stream_id <= 0 ||
                row.id !==
                    `local:${encodeURIComponent(entry.sourceId)}:live:${row.provider.stream_id}` ||
                ids.has(row.id) ||
                typeof row.name !== 'string' ||
                !row.name.trim() ||
                typeof row.provider.name !== 'string' ||
                !row.provider.name ||
                !['country', 'category', 'language'].every(
                    (key) => typeof row[key] === 'string'
                ) ||
                !Array.isArray(row.categories) ||
                !row.categories.every((v) => typeof v === 'string') ||
                (row.state !== undefined &&
                    (typeof row.state !== 'string' ||
                        (row.state &&
                            (row.country !== 'US' ||
                                !/^US-(AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)$/.test(
                                    row.state
                                ))))) ||
                !['classified', 'unclassified'].includes(row.status) ||
                !['manual', 'rules'].includes(row.origin) ||
                !Number.isSafeInteger(row.ruleVersion) ||
                row.ruleVersion < 0
            )
                throw new Error(
                    'Invalid baseline record or unsupported fields'
                );
            ids.add(row.id);
        }
    }
    return manifest;
}

function stageBaseline(projectDir, filename) {
    let manifest = { schemaVersion: 1, baselines: [] };
    if (filename) {
        if (fs.statSync(filename).size > 32 * 1024 * 1024)
            throw new Error('Classification baseline exceeds 32 MiB');
        manifest = validateBaseline(
            JSON.parse(fs.readFileSync(filename, 'utf8'))
        );
    }
    const web = path.join(projectDir, 'dist', 'apps', 'web');
    if (!fs.existsSync(path.join(web, 'index.html')))
        throw new Error(
            'Build desktop web assets before staging classifications'
        );
    const output = path.join(
        web,
        'assets',
        'discovery',
        'classification-baseline.json'
    );
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
    return output;
}

module.exports = async (context) => {
    stageBaseline(
        context.packager.projectDir,
        process.env.IPTVNATOR_DISCOVERY_BASELINE_FILE
    );
};
module.exports.stageBaseline = stageBaseline;
module.exports.validateBaseline = validateBaseline;

if (require.main === module) {
    stageBaseline(
        process.argv[2] ?? process.cwd(),
        process.argv[3] ?? process.env.IPTVNATOR_DISCOVERY_BASELINE_FILE
    );
}
