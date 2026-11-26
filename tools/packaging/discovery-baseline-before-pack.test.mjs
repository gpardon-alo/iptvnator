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

test('accepts optional supported quality and rejects unsupported quality before packaging', () => {
    for (const quality of ['4K', 'FHD', 'HD', 'SD', 'Unknown']) {
        const value = manifest();
        value.baselines[0].rows[0].quality = quality;
        assert.equal(
            validateBaseline(value).baselines[0].rows[0].quality,
            quality
        );
    }
    for (const quality of ['', 'UHD', 'hd', null, 1080]) {
        const value = manifest();
        value.baselines[0].rows[0].quality = quality;
        assert.throws(() => validateBaseline(value));
    }
});

test('validates and preserves optional dictionary EPG metadata in private baselines', () => {
    const value = manifest();
    value.baselines[0].rows[0].epg = {
        xmltvId: 'News.example@SD',
        source: 'example.test',
        status: 'matched',
    };
    assert.equal(
        validateBaseline(value).baselines[0].rows[0].epg.xmltvId,
        'News.example@SD'
    );
    value.baselines[0].rows[0].epg.password = 'synthetic';
    assert.throws(() => validateBaseline(value));
});

test('preserves incomplete and nullable EPG references before packaging', () => {
    for (const epg of [
        {},
        { xmltvId: 'SyntheticNews.example@SD' },
        { source: 'example.test', id: 'synthetic-native', xmltvId: null },
        ...['unmatched', 'skipped', 'review'].map((status) => ({
            source: null,
            id: null,
            xmltvId: null,
            status,
            reason: 'Synthetic reference unavailable',
        })),
        {
            source: null,
            id: null,
            xmltvId: null,
            language: null,
            channelsFile: null,
            status: null,
            method: null,
            reason: null,
        },
    ]) {
        const value = manifest();
        value.baselines[0].rows[0].epg = epg;
        assert.deepEqual(validateBaseline(value).baselines[0].rows[0].epg, epg);
    }
    for (const epg of [{ xmltvId: 123 }, { reason: [] }, { password: null }]) {
        const value = manifest();
        value.baselines[0].rows[0].epg = epg;
        assert.throws(() => validateBaseline(value));
    }
});
