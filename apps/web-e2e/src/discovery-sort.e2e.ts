import { expect, test } from './fixtures';
import { configureMockProviderBackend } from './provider-target-route';
import {
    addXtreamPortal,
    interceptXtreamRequests,
} from './xtream-series-playback.fixture';

test.use({ viewport: { width: 1440, height: 900 } });

for (const theme of ['light', 'dark'] as const) {
    test(`Discovery sorts 24/7 channels last without renaming them in ${theme} mode`, async ({
        page,
    }) => {
        await page.emulateMedia({ colorScheme: theme });
        await configureMockProviderBackend(page);
        await interceptXtreamRequests(page);
        const names = [
            '24/7 Zeta',
            'Zulu',
            '24/7 Alpha 10',
            '24 / 7 alpha 2',
            'Alpha',
        ];
        await page.route('**/localhost:3000/xtream**', async (route) => {
            const action = new URL(route.request().url()).searchParams.get(
                'action'
            );
            if (action === 'get_live_categories') {
                await route.fulfill({
                    json: {
                        payload: [
                            {
                                category_id: '901',
                                category_name: 'Synthetic sorting',
                            },
                        ],
                    },
                });
            } else if (action === 'get_live_streams') {
                await route.fulfill({
                    json: {
                        payload: names.map((name, index) => ({
                            stream_id: 99300 + index,
                            name,
                            category_id: '901',
                            stream_type: 'live',
                            stream_icon: '',
                        })),
                    },
                });
            } else await route.fallback();
        });
        await page.goto('/');
        await addXtreamPortal(page, { name: 'Synthetic sorting source' });
        await page.goto('/workspace/discovery');
        await expect(page.locator('.result-count')).toHaveText('5 channels');
        const titles = page.locator('.channel-tile h3');
        await expect(titles).toHaveText([
            'Alpha',
            'Zulu',
            '24 / 7 alpha 2',
            '24/7 Alpha 10',
            '24/7 Zeta',
        ]);
        await page.locator('#workspace-shell-search-input').fill('alpha');
        await expect(titles).toHaveText([
            'Alpha',
            '24 / 7 alpha 2',
            '24/7 Alpha 10',
        ]);
        await page
            .getByRole('button', { name: 'Clear search', exact: true })
            .click();
        await expect(titles).toHaveText([
            'Alpha',
            'Zulu',
            '24 / 7 alpha 2',
            '24/7 Alpha 10',
            '24/7 Zeta',
        ]);
    });
}
