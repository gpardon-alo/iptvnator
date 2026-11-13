import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { configureMockProviderBackend } from './provider-target-route';
import {
    addXtreamPortal,
    interceptXtreamRequests,
} from './xtream-series-playback.fixture';

test.use({ viewport: { width: 1440, height: 1000 } });

async function mockCatalog(page: Page) {
    await configureMockProviderBackend(page);
    await interceptXtreamRequests(page);
    let fail = false;
    await page.route('**/localhost:3000/xtream**', async (route) => {
        const action = new URL(route.request().url()).searchParams.get(
            'action'
        );
        if (action === 'get_live_categories') {
            if (fail)
                return route.fulfill({
                    status: 503,
                    json: { error: 'Synthetic unavailable' },
                });
            return route.fulfill({
                json: {
                    payload: [
                        {
                            category_id: '901',
                            category_name: 'US Sports English',
                        },
                    ],
                },
            });
        }
        if (action === 'get_live_streams') {
            return route.fulfill({
                json: {
                    payload: [
                        {
                            stream_id: 99001,
                            name: 'Synthetic Dictionary TV',
                            category_id: '901',
                            stream_type: 'live',
                            stream_icon: '',
                        },
                    ],
                },
            });
        }
        await route.fallback();
    });
    return {
        fail: (value: boolean) => {
            fail = value;
        },
    };
}

test('Dictionary is searchable under Library and handles an empty library', async ({
    page,
}) => {
    await page.goto('/workspace/settings/general');
    await page
        .locator('app-workspace-shell-header input[type="search"]')
        .fill('classifications');
    await page
        .locator('[data-test-id="settings-search-result-dictionary"]')
        .click();
    await expect(page).toHaveURL(/\/workspace\/settings\/dictionary$/);
    const nav = page.locator('[data-group="library"]');
    await expect(
        nav.locator('[data-test-id="settings-section-dictionary"]')
    ).toBeVisible();
    await expect(
        page.getByRole('heading', { name: 'Dictionary', exact: true })
    ).toBeVisible();
    await expect(page.getByLabel('Dictionary source')).toBeDisabled();
    await expect(
        page.getByRole('status').filter({ hasText: 'Add an Xtream source' })
    ).toBeVisible();
    await expect(page.locator('app-discovery-classifications')).toHaveCount(0);
    await page.getByRole('link', { name: 'Open Sources', exact: true }).click();
    await expect(page).toHaveURL(/\/workspace\/sources$/);
});

for (const theme of ['light', 'dark'] as const) {
    test(`Dictionary edits, import/export and source isolation work inside ${theme} Settings`, async ({
        page,
    }, testInfo) => {
        await mockCatalog(page);
        await page.goto('/');
        await addXtreamPortal(page, { name: 'Synthetic dictionary A' });
        await page.goto('/');
        await addXtreamPortal(page, {
            name: 'Synthetic dictionary B',
            username: 'synthetic-second',
        });
        await page.goto('/workspace/settings/appearance');
        const themeOption = page.locator(
            `[data-test-id="${theme.toUpperCase()}_THEME"]`
        );
        await themeOption.click();
        await expect(themeOption).toHaveAttribute('aria-checked', 'true');
        const saveSettings = page.locator('[data-test-id="save-settings"]');
        if (await saveSettings.isVisible()) await saveSettings.click();
        await expect(saveSettings).toBeHidden();
        await page
            .locator('[data-test-id="settings-section-dictionary"]')
            .click();
        const source = page.getByLabel('Dictionary source');
        await expect(saveSettings).toBeHidden();
        await source.selectOption({ label: 'Synthetic dictionary A' });
        const editor = page.locator('app-discovery-classifications');
        await expect(editor.locator('.mapping-row')).toHaveCount(1);
        await expect(saveSettings).toBeHidden();
        await editor
            .getByRole('button', {
                name: 'Classify current streams',
                exact: true,
            })
            .click();
        await editor.getByRole('button', { name: /^All mappings/ }).click();
        await editor.locator('.mapping-row').click();
        await editor
            .getByLabel('Mapping display name')
            .fill('Synthetic corrected channel');
        await editor
            .getByRole('button', { name: 'Save classification', exact: true })
            .click();
        await expect(editor.getByRole('status')).toContainText(
            'Mappings saved'
        );
        await expect(saveSettings).toBeHidden();
        const downloadPromise = page.waitForEvent('download');
        await editor
            .getByRole('button', { name: 'Export mapping JSON', exact: true })
            .click();
        const download = await downloadPromise;
        const file = await download.path();
        if (!file) throw new Error('Missing dictionary export');
        const rows = JSON.parse(await readFile(file, 'utf8'));
        expect(rows[0].name).toBe('Synthetic corrected channel');
        rows[0].name = 'Synthetic imported channel';
        const chooser = page.waitForEvent('filechooser');
        await editor
            .getByRole('button', { name: 'Import dictionary', exact: true })
            .click();
        await (
            await chooser
        ).setFiles({
            name: 'synthetic-dictionary.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(rows)),
        });
        await expect(editor.getByRole('status')).toHaveClass(/notice-success/);
        await expect(editor.getByRole('status')).toContainText(
            'Imported 1 dictionary'
        );
        await expect(saveSettings).toBeHidden();
        await page.reload();
        await expect(source).toHaveValue(rows[0].provider.source_id);
        await editor.getByRole('button', { name: /^All mappings/ }).click();
        await expect(editor.locator('.mapping-row')).toContainText(
            'Synthetic imported channel'
        );
        await editor.locator('.mapping-row').click();
        await source.selectOption({ label: 'Synthetic dictionary B' });
        await expect(editor.getByLabel('Mapping display name')).toHaveCount(0);
        await expect(editor.locator('.mapping-row')).toContainText(
            'Synthetic Dictionary TV'
        );
        await source.selectOption({ label: 'Synthetic dictionary A' });
        await editor.getByRole('button', { name: /^All mappings/ }).click();
        await expect(editor.locator('.mapping-row')).toContainText(
            'Synthetic imported channel'
        );
        await editor.locator('.mapping-row').click();
        await page.screenshot({
            path: testInfo.outputPath(`dictionary-settings-${theme}.png`),
        });
        await page.goto('/discovery');
        await page
            .locator('[data-test-id="playlist-switcher-trigger"]')
            .click();
        await page
            .locator('app-playlist-switcher-panel [role="option"]')
            .filter({ hasText: 'Synthetic dictionary A' })
            .first()
            .click();
        await expect(
            page.getByRole('button', {
                name: 'Synthetic imported channel',
                exact: true,
            })
        ).toBeVisible();
    });
}

test('Dictionary shows a source-load error and supports retry', async ({
    page,
}) => {
    const catalog = await mockCatalog(page);
    await page.goto('/');
    await addXtreamPortal(page, { name: 'Synthetic retry dictionary' });
    catalog.fail(true);
    await page.goto('/workspace/settings/dictionary');
    await page
        .getByLabel('Dictionary source')
        .selectOption({ label: 'Synthetic retry dictionary' });
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Could not load this source');
    catalog.fail(false);
    await alert.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(alert).toHaveCount(0);
    await expect(
        page.locator('app-discovery-classifications .mapping-row')
    ).toHaveCount(1);
});
