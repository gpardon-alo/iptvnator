import { expect, test } from './fixtures';
import { configureMockProviderBackend } from './provider-target-route';
import {
    addXtreamPortal,
    interceptXtreamRequests,
} from './xtream-series-playback.fixture';

test('Baseline imports atomically into historical v1 storage and preserves later desktop edits', async ({
    page,
}) => {
    await configureMockProviderBackend(page);
    await page.goto('/');
    await interceptXtreamRequests(page);
    await page.route('**/localhost:3000/xtream**', async (route) => {
        const action = new URL(route.request().url()).searchParams.get(
            'action'
        );
        if (action === 'get_live_categories')
            await route.fulfill({
                json: {
                    payload: [
                        {
                            category_id: '901',
                            category_name: 'Synthetic',
                            parent_id: 0,
                        },
                    ],
                },
            });
        else if (action === 'get_live_streams')
            await route.fulfill({
                json: {
                    payload: [10, 11].map((stream_id) => ({
                        stream_id,
                        name: `Synthetic stream ${stream_id}`,
                        category_id: '901',
                        stream_type: 'live',
                        stream_icon: '',
                    })),
                },
            });
        else await route.fallback();
    });
    let sourceId = '';
    let version = 1;
    const mapping = (streamId: number, name: string) => ({
        id: `local:${encodeURIComponent(sourceId)}:live:${streamId}`,
        name,
        categories: ['United States', 'News', 'English'],
        provider: {
            source_id: sourceId,
            stream_id: streamId,
            name: `Synthetic stream ${streamId}`,
        },
        country: 'US',
        state: 'US-CA',
        category: 'news',
        language: 'English',
        status: 'classified',
        origin: 'manual',
        ruleVersion: 4,
    });
    await page.route(
        '**/assets/discovery/classification-baseline.json',
        (route) =>
            route.fulfill({
                json: {
                    schemaVersion: 1,
                    baselines: [
                        {
                            sourceId,
                            version,
                            rows: [
                                mapping(10, 'Baseline name'),
                                mapping(11, 'Imported baseline'),
                                mapping(12, 'Absent catalog stream'),
                            ],
                        },
                    ],
                },
            })
    );
    await addXtreamPortal(page, { name: 'Synthetic desktop source' });
    await page.goto('/discovery');
    const selector = page.getByLabel('Discovery source');
    sourceId =
        (await selector
            .locator('option')
            .filter({ hasText: 'Synthetic desktop source' })
            .getAttribute('value')) ?? '';
    expect(sourceId).not.toBe('');
    const desktop = {
        ...mapping(10, 'Desktop correction'),
        language: '',
        state: 'US-FL',
        status: 'unclassified',
    };
    await page.evaluate(
        async ({ sourceId, desktop }) => {
            await new Promise<void>((resolve, reject) => {
                const open = indexedDB.open(
                    'iptvnator:discovery-mappings-v1',
                    1
                );
                open.onupgradeneeded = () =>
                    open.result.createObjectStore('sources');
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                    const db = open.result;
                    const tx = db.transaction('sources', 'readwrite');
                    tx.objectStore('sources').put([desktop], sourceId);
                    tx.oncomplete = () => {
                        db.close();
                        resolve();
                    };
                    tx.onabort = () => {
                        db.close();
                        reject(tx.error);
                    };
                };
            });
        },
        { sourceId, desktop }
    );
    await selector.selectOption(sourceId);
    await expect(page.locator('.result-count')).toHaveText('2 channels');
    await expect(
        page
            .locator('app-content-card')
            .filter({ hasText: 'Desktop correction' })
    ).toBeVisible();
    await expect(
        page
            .locator('app-content-card')
            .filter({ hasText: 'Imported baseline' })
    ).toBeVisible();

    const snapshot = () =>
        page.evaluate(async (sourceId) => {
            return new Promise<{
                rows: (typeof desktop)[];
                receipt: { version: number };
                backup: (typeof desktop)[];
                backup3: unknown;
            }>((resolve, reject) => {
                const open = indexedDB.open(
                    'iptvnator:discovery-mappings-v1',
                    1
                );
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                    const db = open.result,
                        tx = db.transaction('sources', 'readonly'),
                        store = tx.objectStore('sources');
                    const rows = store.get(sourceId),
                        receipt = store.get(['baseline-receipt', sourceId]),
                        backup = store.get(['baseline-backup', sourceId, 1]),
                        backup3 = store.get(['baseline-backup', sourceId, 3]);
                    tx.oncomplete = () => {
                        db.close();
                        resolve({
                            rows: rows.result,
                            receipt: receipt.result,
                            backup: backup.result,
                            backup3: backup3.result,
                        });
                    };
                    tx.onabort = () => {
                        db.close();
                        reject(tx.error);
                    };
                };
            });
        }, sourceId);
    let saved = await snapshot();
    expect(saved.rows).toHaveLength(3);
    expect(saved.rows.find((row) => row.provider.stream_id === 10)).toEqual(
        desktop
    );
    expect(saved.backup).toEqual([desktop]);
    expect(saved.receipt.version).toBe(1);

    // Simulate a subsequent local edit/deletion without invoking the importer.
    const putRows = (rows: unknown) =>
        page.evaluate(
            async ({ sourceId, rows }) => {
                await new Promise<void>((resolve, reject) => {
                    const open = indexedDB.open(
                        'iptvnator:discovery-mappings-v1',
                        1
                    );
                    open.onerror = () => reject(open.error);
                    open.onsuccess = () => {
                        const db = open.result,
                            tx = db.transaction('sources', 'readwrite');
                        tx.objectStore('sources').put(rows, sourceId);
                        tx.oncomplete = () => {
                            db.close();
                            resolve();
                        };
                        tx.onabort = () => {
                            db.close();
                            reject(tx.error);
                        };
                    };
                });
            },
            { sourceId, rows }
        );
    const edited = saved.rows
        .filter((row) => row.provider.stream_id !== 11)
        .map((row) =>
            row.provider.stream_id === 10
                ? { ...row, name: 'Later desktop edit' }
                : row
        );
    await putRows(edited);
    await page.reload();
    await expect(
        page
            .locator('app-content-card')
            .filter({ hasText: 'Later desktop edit' })
    ).toBeVisible();
    saved = await snapshot();
    expect(saved.rows).toEqual(edited);
    expect(saved.backup).toEqual([desktop]);
    version = 2;
    await page.reload();
    await expect(
        page
            .locator('app-content-card')
            .filter({ hasText: 'Imported baseline' })
    ).toBeVisible();
    saved = await snapshot();
    expect(saved.rows.find((row) => row.provider.stream_id === 10)?.name).toBe(
        'Later desktop edit'
    );
    expect(saved.receipt.version).toBe(2);

    // An unreadable historical value must abort before snapshot, merge or receipt.
    version = 3;
    await putRows(null);
    await page.reload();
    await expect(
        page.getByText(
            'Could not load this source or its saved mappings. Retry without clearing your data.'
        )
    ).toBeVisible();
    saved = await snapshot();
    expect(saved.rows).toBeNull();
    expect(saved.receipt.version).toBe(2);
    expect(saved.backup3).toBeUndefined();
});
