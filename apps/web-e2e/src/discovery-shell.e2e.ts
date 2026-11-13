import { expect, test } from './fixtures';
import { configureMockProviderBackend } from './provider-target-route';
import {
    addXtreamPortal,
    interceptXtreamRequests,
} from './xtream-series-playback.fixture';
import { importPlaylist } from './player-settings-panel.fixture';

test('Discovery redirects old links, shares search, restores history and cancels queued typing on Clear filters', async ({
    page,
}) => {
    await page.goto('/discovery?q=Marea');
    await expect(page).toHaveURL(/\/workspace\/discovery\?q=Marea$/);
    const search = page.locator('#workspace-shell-search-input');
    await expect(search).toHaveValue('Marea');
    await expect(page.locator('.channel-tile').first()).toContainText('Marea');
    await expect(page.locator('app-discovery .topbar')).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: 'Discovery settings' })
    ).toHaveCount(0);
    await page.goto('/workspace/discovery?q=Pulse');
    await expect(search).toHaveValue('Pulse');
    await page.goBack();
    await expect(search).toHaveValue('Marea');
    await page
        .getByRole('button', { name: 'Clear search', exact: true })
        .click();
    await expect(search).toHaveValue('');
    await expect(page).toHaveURL(/\/workspace\/discovery$/);
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeEnabled();
    await page.clock.install();
    await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>(
            '#workspace-shell-search-input'
        )!;
        input.value = 'queued';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        document
            .querySelector<HTMLButtonElement>('.filter-summary .clear-button')!
            .click();
    });
    await page.clock.runFor(600);
    await expect(search).toHaveValue('');
    await expect(
        page.getByLabel('Active filters', { exact: true }).locator('span')
    ).toHaveCount(0);
    await expect(page).toHaveURL(/\/workspace\/discovery$/);
});

test('Shared source selection switches Discovery in place and retains the search', async ({
    page,
}) => {
    await configureMockProviderBackend(page);
    await interceptXtreamRequests(page);
    await page.route('**/localhost:3000/xtream**', async (route) => {
        const action = new URL(route.request().url()).searchParams.get(
            'action'
        );
        if (action === 'get_live_categories')
            return route.fulfill({
                json: {
                    payload: [
                        {
                            category_id: '901',
                            category_name: 'Synthetic sports',
                        },
                    ],
                },
            });
        if (action === 'get_live_streams')
            return route.fulfill({
                json: {
                    payload: [
                        {
                            stream_id: 99101,
                            category_id: '901',
                            name: 'Synthetic shell channel',
                            stream_type: 'live',
                            stream_icon: '',
                        },
                    ],
                },
            });
        await route.fallback();
    });
    await page.goto('/');
    await addXtreamPortal(page, { name: 'Synthetic shell A' });
    await page.goto('/');
    await addXtreamPortal(page, {
        name: 'Synthetic shell B',
        username: 'synthetic-second',
    });
    await page.goto('/workspace/discovery?q=Synthetic');
    const trigger = page.locator('[data-test-id="playlist-switcher-trigger"]');
    await expect(trigger).toContainText('Synthetic shell B');
    await expect(page.locator('.result-count')).toHaveText('1 channel');
    await trigger.click();
    await page
        .locator('app-playlist-switcher-panel [role="option"]')
        .filter({ hasText: 'Synthetic shell A' })
        .first()
        .click();
    await expect(trigger).toContainText('Synthetic shell A');
    await expect(page).toHaveURL(/\/workspace\/discovery\?q=Synthetic$/);
    await expect(page.locator('#workspace-shell-search-input')).toHaveValue(
        'Synthetic'
    );
    await expect(page.locator('.channel-tile')).toContainText(
        'Synthetic shell channel'
    );
    await page.reload();
    await expect(trigger).toContainText('Synthetic shell A');
    await expect(page.locator('.result-count')).toHaveText('1 channel');
});

test('Discovery explains an unsupported selection instead of showing another source', async ({
    page,
}) => {
    await importPlaylist(page);
    await page.goto('/workspace/discovery');
    await expect(page.getByRole('status')).toContainText(
        'Choose an Xtream source with Live TV enabled'
    );
    await expect(page.locator('.channel-tile')).toHaveCount(0);
    await expect(
        page.locator('[data-test-id="playlist-switcher-trigger"]')
    ).toBeVisible();
});
