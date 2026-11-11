import { expect, test } from './fixtures';
import { configureMockProviderBackend } from './provider-target-route';
import {
    addXtreamPortal,
    interceptXtreamRequests,
} from './xtream-series-playback.fixture';

test.use({ viewport: { width: 1440, height: 900 } });

for (const theme of ['light', 'dark'] as const) {
    test(`Sports shortcuts match aliases and persist in ${theme} mode`, async ({
        page,
    }) => {
        await page.emulateMedia({ colorScheme: theme });
        await configureMockProviderBackend(page);
        await page.goto('/');
        await interceptXtreamRequests(page);
        const names = [
            'Synthetic LaLiga feed',
            'Synthetic La Liga feed',
            'Synthetic Champions League feed',
            'Synthetic Liga de Campeones feed',
            'Synthetic Liga 1 feed',
            'Synthetic Liga 10 feed',
            'Synthetic NBA feed',
            'Synthetic unrelated feed',
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
                                category_id: 'synthetic',
                                category_name: 'Synthetic feeds',
                                parent_id: 0,
                            },
                        ],
                    },
                });
            } else if (action === 'get_live_streams') {
                await route.fulfill({
                    json: {
                        payload: names.map((name, index) => ({
                            stream_id: 9200 + index,
                            name,
                            category_id: 'synthetic',
                            stream_type: 'live',
                            stream_icon: '',
                        })),
                    },
                });
            } else await route.fallback();
        });
        await addXtreamPortal(page, { name: 'Synthetic tournament source' });
        await page.goto('/discovery');
        const source = page.getByLabel('Discovery source');
        const id = await source
            .locator('option')
            .filter({ hasText: 'Synthetic tournament source' })
            .getAttribute('value');
        expect(id).toBeTruthy();
        await source.selectOption(id ?? '');
        await expect(page.locator('.result-count')).toHaveText('8 channels');
        const region = page.getByLabel('Explore a region');
        await region.selectOption('Sports');
        const sports = page.getByRole('group', { name: 'Sports tournaments' });
        await expect(sports.getByRole('button')).toHaveCount(18);
        await expect(
            page.getByRole('group', {
                name: 'Interactive geographic channel filter',
            })
        ).toBeHidden();
        await expect
            .poll(() =>
                sports
                    .locator('img')
                    .evaluateAll((images) =>
                        images.every(
                            (image) =>
                                (image as HTMLImageElement).complete &&
                                (image as HTMLImageElement).naturalWidth > 0
                        )
                    )
            )
            .toBe(true);
        const laliga = sports.getByRole('button', {
            name: 'LaLiga (Spain)',
            exact: true,
        });
        await laliga.click();
        await expect(page.locator('.result-count')).toHaveText('2 channels');
        await expect(page.locator('.channel-tile')).toContainText([
            'Synthetic La Liga feed',
            'Synthetic LaLiga feed',
        ]);
        await laliga.click();
        await expect(page.locator('.result-count')).toHaveText('8 channels');
        const champions = sports.getByRole('button', {
            name: 'UEFA Champions League',
            exact: true,
        });
        await champions.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.result-count')).toHaveText('2 channels');
        await sports
            .getByRole('button', { name: 'Liga 1 (Peru)', exact: true })
            .click();
        await expect(page.locator('.result-count')).toHaveText('1 channel');
        await expect(page.locator('.channel-tile')).toContainText(
            'Synthetic Liga 1 feed'
        );
        await expect
            .poll(() =>
                page.evaluate(
                    () =>
                        JSON.parse(
                            localStorage.getItem(
                                'iptvnator-discovery-prototype:v1'
                            ) ?? '{}'
                        ).league
                )
            )
            .toBe('liga-1-peru');
        await page.reload();
        await expect(region).toHaveValue('Sports');
        await expect(
            sports.getByRole('button', { name: 'Liga 1 (Peru)', exact: true })
        ).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.result-count')).toHaveText('1 channel');
        await page.getByLabel('Search channels').fill('unrelated');
        await expect(page.locator('.result-count')).toHaveText('0 channels');
        await page
            .getByRole('button', { name: 'Clear channel search', exact: true })
            .click();
        await expect(page.locator('.result-count')).toHaveText('1 channel');
        await page
            .locator('.filter-summary')
            .getByRole('button', { name: 'Clear filters', exact: true })
            .click();
        await expect(page.locator('.result-count')).toHaveText('8 channels');
        await sports.getByRole('button', { name: 'NBA', exact: true }).click();
        await expect(page.locator('.result-count')).toHaveText('1 channel');
        await page.screenshot({
            path: `../../dist/discovery-sports-${theme}.png`,
        });
        await region.selectOption('World');
        await expect(page.locator('.result-count')).toHaveText('8 channels');
        await expect(page.locator('.filter-summary')).not.toContainText('NBA');
        await expect(sports).toBeHidden();
    });
}

test('Sports keeps a usable label when a logo fails', async ({ page }) => {
    await page.route('**/assets/discovery/leagues/laliga.png', (route) =>
        route.abort()
    );
    await page.goto('/discovery');
    await page.getByLabel('Explore a region').selectOption('Sports');
    const league = page.getByRole('button', {
        name: 'LaLiga (Spain)',
        exact: true,
    });
    await expect(league.locator('.league-logo span')).toHaveText(
        'LaLiga (Spain)'
    );
    await expect(league.locator('img')).toHaveCount(0);
    await league.click();
    await expect(league).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.filter-summary')).toContainText(
        'LaLiga (Spain)'
    );
});
