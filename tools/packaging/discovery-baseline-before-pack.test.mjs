import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
    stageBaseline,
    validateBaseline,
} = require('./discovery-baseline-before-pack.cjs');

const manifest = () => ({
    schemaVersion: 1,
    baselines: [
        {
            sourceId: 'desktop-source',
            version: 1,
            rows: [
                {
                    id: 'local:desktop-source:live:10',
                    name: 'Synthetic News',
                    categories: ['United States', 'News', 'English'],
                    provider: {
                        source_id: 'desktop-source',
                        stream_id: 10,
                        name: 'Synthetic News HD',
                    },
                    country: 'US',
                    state: 'US-FL',
                    category: 'news',
                    language: 'English',
                    status: 'classified',
                    origin: 'manual',
                    ruleVersion: 4,
                },
            ],
        },
    ],
});

test('stages private input only into the packaged web output and clears it on an unseeded build', () => {
    const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), 'discovery-baseline-package-')
    );
    try {
        const web = path.join(directory, 'dist/apps/web');
        fs.mkdirSync(web, { recursive: true });
        fs.writeFileSync(path.join(web, 'index.html'), '<html></html>');
        const input = path.join(directory, 'private.json');
        const value = manifest();
        fs.writeFileSync(input, JSON.stringify(value));
        const output = stageBaseline(directory, input);
        assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), value);
        stageBaseline(directory);
        assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), {
            schemaVersion: 1,
            baselines: [],
        });
        assert.deepEqual(JSON.parse(fs.readFileSync(input, 'utf8')), value);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('rejects credentials, source mismatch and conflicting duplicates before packaging', () => {
    for (const mutate of [
        (m) => {
            m.password = 'synthetic-secret';
        },
        (m) => {
            m.baselines[0].rows[0].provider.password = 'synthetic-secret';
        },
        (m) => {
            m.baselines[0].sourceId = 'wrong-source';
        },
        (m) => {
            m.baselines[0].rows.push({
                ...m.baselines[0].rows[0],
                name: 'Conflicting synthetic name',
            });
        },
        (m) => {
            m.baselines[0].rows[0].state = 'US-XX';
        },
    ]) {
        const value = manifest();
        mutate(value);
        assert.throws(() => validateBaseline(value));
    }
});
