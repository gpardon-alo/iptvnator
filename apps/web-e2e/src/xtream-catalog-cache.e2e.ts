import { expect, test } from './fixtures';
import { configureMockProviderBackend } from './provider-target-route';
import {
    addXtreamPortal,
    interceptXtreamRequests,
    MOCK_SERVER,
} from './xtream-series-playback.fixture';

test.use({ serviceWorkers: 'block' });

test('@web @xtream @persistence catalog survives reload, expires after 24 hours and supports manual refresh', async ({
    page,
    request,
}) => {
    await request.post(`${MOCK_SERVER}/reset?username=user1&password=pass1`);
    await configureMockProviderBackend(page);
    // LAN HTTP deployments use the bundled SHA-256 fallback.
    await page.addInitScript(() =>
        Object.defineProperty(crypto, 'subtle', { value: undefined })
    );
    await page.goto('/');
    await interceptXtreamRequests(page);
    const actions = new Set([
        'get_live_categories',
        'get_vod_categories',
        'get_series_categories',
        'get_live_streams',
        'get_vod_streams',
        'get_series',
    ]);
    const calls: string[] = [];
    page.on('request', (req) => {
        const action = new URL(req.url()).searchParams.get('action');
        if (action && actions.has(action)) calls.push(action);
    });
    await addXtreamPortal(page, { name: 'Synthetic cached source' });
    await expect.poll(() => new Set(calls).size).toBe(6);
    // Catalog cards appear only after the import has completed.
    await expect(page.locator('app-grid-list').first()).toBeVisible();
    const initial = calls.length;
    await page.reload();
    await expect(page.locator('app-grid-list').first()).toBeVisible();
    await expect(
        page.getByText('Synthetic cached source', { exact: true }).first()
    ).toBeVisible();
    expect(calls).toHaveLength(initial);

    await page.evaluate(async () => {
        const names = await indexedDB.databases();
        const name = names.find((db) =>
            db.name?.endsWith(':xtream-catalog-v1')
        )?.name;
        if (!name) throw new Error('Missing persistent catalog');
        await new Promise<void>((resolve, reject) => {
            const open = indexedDB.open(name);
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const db = open.result;
                const tx = db.transaction('catalog', 'readwrite');
                const cursor = tx.objectStore('catalog').openCursor();
                cursor.onsuccess = () => {
                    const row = cursor.result;
                    if (!row) return;
                    row.update({
                        ...row.value,
                        fetchedAt: Date.now() - 24 * 60 * 60 * 1000,
                    });
                    row.continue();
                };
                tx.oncomplete = () => {
                    db.close();
                    resolve();
                };
                tx.onerror = () => {
                    db.close();
                    reject(tx.error);
                };
            };
        });
    });
    await page.reload();
    await expect.poll(() => calls.length).toBe(initial + 6);
    await expect(page.locator('app-grid-list').first()).toBeVisible();

    await page.locator('[data-test-id="playlist-switcher-trigger"]').click();
    const source = page
        .locator('app-playlist-switcher-panel [role="option"]')
        .filter({ hasText: 'Synthetic cached source' });
    await source.locator('.source-row__more').click();
    await page.getByRole('menuitem', { name: /Refresh/i }).click();
    await expect.poll(() => calls.length).toBe(initial + 12);
    await expect(page.locator('app-grid-list').first()).toBeVisible();
});
