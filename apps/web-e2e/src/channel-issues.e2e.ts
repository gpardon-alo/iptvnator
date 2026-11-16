import { expect, test } from './fixtures';
import { configureMockProviderBackend } from './provider-target-route';
import {
    addXtreamPortal,
    interceptXtreamRequests,
} from './xtream-series-playback.fixture';
import { readFile } from 'node:fs/promises';

test.use({ viewport: { width: 1440, height: 900 } });
for (const theme of ['light', 'dark'] as const) {
    test(`records observed logo/EPG issues locally and exports them in ${theme} mode`, async ({
        page,
    }) => {
        await page.emulateMedia({ colorScheme: theme });
        await configureMockProviderBackend(page);
        await interceptXtreamRequests(page);
        await page.route('https://artwork.example.test/**', (route) =>
            route.fulfill({ status: 404, body: 'missing' })
        );
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
                                category_name: 'Synthetic issues',
                            },
                        ],
                    },
                });
            else if (action === 'get_live_streams')
                await route.fulfill({
                    json: {
                        payload: [
                            {
                                stream_id: 99101,
                                name: 'Example Missing',
                                category_id: '901',
                                stream_type: 'live',
                                stream_icon: '',
                            },
                            {
                                stream_id: 99102,
                                name: 'Example Broken',
                                category_id: '901',
                                stream_type: 'live',
                                stream_icon:
                                    'https://artwork.example.test/broken.png',
                            },
                        ],
                    },
                });
            else if (
                action === 'get_short_epg' ||
                action === 'get_simple_data_table' || action === 'get_simple_date_table'
            )
                await route.fulfill({
                    json: { payload: { epg_listings: [] } },
                });
            else await route.fallback();
        });
        await page.goto('/');
        await addXtreamPortal(page, { name: 'Synthetic issue source' });
        await page.goto('/workspace/discovery');
        await expect(page.locator('.result-count')).toHaveText('2 channels');
        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        JSON.parse(
                            localStorage.getItem('channel-issues-v1') ?? '[]'
                        ).length
                )
            )
            .toBe(2);
        await page
            .locator('.channel-tile')
            .filter({ hasText: 'Example Missing' })
            .click();
        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        JSON.parse(
                            localStorage.getItem('channel-issues-v1') ?? '[]'
                        ).filter(
                            (issue: { kind: string }) => issue.kind === 'epg'
                        ).length
                )
            )
            .toBe(1);
        await page.goto('/workspace/settings/dictionary');
        const reports = page.locator('app-settings-channel-issues');
        await expect(
            reports.getByRole('heading', { name: 'Channel issues' })
        ).toBeVisible();
        await expect(reports.locator('li')).toHaveCount(3);
        await expect(reports).toContainText('Logo failed to load');
        await expect(reports).toContainText('No EPG programmes returned');
        await page.reload();
        await expect(reports.locator('li')).toHaveCount(3);
        const downloadPromise = page.waitForEvent('download');
        await reports
            .getByRole('button', { name: 'Export issues JSON' })
            .click();
        const download = await downloadPromise;
        const exported = JSON.parse(
            await readFile((await download.path())!, 'utf8')
        );
        expect(exported.schemaVersion).toBe(1);
        expect(exported.issues).toHaveLength(3);
        expect(JSON.stringify(exported)).not.toContain('artwork.example.test');
        expect(JSON.stringify(exported)).not.toContain('password');
        await reports.getByRole('button', { name: /^Logos/ }).click();
        await expect(reports.locator('li')).toHaveCount(2);
        await reports.getByRole('button', { name: /^EPG/ }).click();
        await expect(reports.locator('li')).toHaveCount(1);
    });
}
