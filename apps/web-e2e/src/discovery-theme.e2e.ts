import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { configureMockProviderBackend } from './provider-target-route';
import {
    addXtreamPortal,
    interceptXtreamRequests,
} from './xtream-series-playback.fixture';

const presets = [
    'light',
    'dark',
    'cream',
    'mocha',
    'night-owl',
    'black-oled',
] as const;
test.use({ viewport: { width: 1440, height: 900 } });

async function saveTheme(page: Page, preset: string) {
    await page.goto('/workspace/settings/appearance');
    const option = preset.replace(/-/g, '_').toUpperCase() + '_THEME';
    const radio = page.locator(
        `[data-test-id="select-theme"] [data-test-id="${option}"]`
    );
    await radio.click();
    await expect(radio).toHaveAttribute('aria-checked', 'true');
    const save = page.locator('[data-test-id="save-settings"]');
    if (await save.isVisible()) {
        await save.click();
        await expect(save).toBeHidden();
    }
}

async function token(page: Page, name: string) {
    return page.evaluate((name) => {
        const probe = document.createElement('span');
        probe.style.color = `var(${name})`;
        document.body.appendChild(probe);
        const result = getComputedStyle(probe).color;
        probe.remove();
        return result;
    }, name);
}

async function expectPalette(page: Page, mode: 'light' | 'dark') {
    const discovery = page.locator('app-discovery');
    await expect(discovery).toHaveCSS(
        'background-color',
        await token(page, '--app-content-bg')
    );
    await expect(discovery).toHaveCSS(
        'color',
        await token(page, '--app-on-surface')
    );
    await expect(discovery).toHaveCSS('color-scheme', mode);
    await expect(
        page.getByRole('textbox', { name: 'Search channels' })
    ).toHaveCSS('color', await token(page, '--app-on-surface'));
}

async function expectSurface(page: Page, element: Locator) {
    await expect(element).toHaveCSS(
        'background-color',
        await token(page, '--app-widget-bg')
    );
    await expect(element).toHaveCSS(
        'color',
        await token(page, '--app-on-surface')
    );
}

for (const preset of presets) {
    test(`Discovery inherits the saved ${preset} palette across its surfaces`, async ({
        page,
    }, testInfo) => {
        const mode =
            preset === 'light' || preset === 'cream' ? 'light' : 'dark';
        // Explicit app choices must win even when the OS has the opposite mode.
        await page.emulateMedia({
            colorScheme: mode === 'light' ? 'dark' : 'light',
        });
        await saveTheme(page, preset);
        await page.goto('/discovery');
        await expect(page.locator('body')).toHaveAttribute(
            'data-app-theme',
            preset
        );
        await expectPalette(page, mode);
        await expect(page.locator('.channel-tile').first()).toBeVisible();
        await expect(page.locator('.card-info h3').first()).toHaveCSS(
            'color',
            await token(page, '--app-on-surface')
        );

        const country = page.getByRole('button', { name: 'Peru', exact: true });
        await country.click();
        const category = page
            .locator('.category')
            .filter({ hasText: 'Sports' });
        await category.click();
        await expect(category).toHaveCSS(
            'background-color',
            await token(page, '--app-selection-surface')
        );
        await expect(category).toHaveCSS(
            'color',
            await token(page, '--app-selection-text-color')
        );
        // Hovering a selected filter must preserve its selected appearance.
        await category.hover();
        await expect(category).toHaveCSS(
            'background-color',
            await token(page, '--app-selection-surface')
        );

        const gear = page.getByRole('button', {
            name: 'Discovery settings',
            exact: true,
        });
        await gear.hover();
        await page.getByRole('textbox', { name: 'Search channels' }).focus();
        await page.keyboard.press('Tab');
        await expect(gear).toBeFocused();
        await expect(gear).toHaveCSS(
            'outline-color',
            await token(page, '--app-focus-ring')
        );
        await expect(country).toHaveCSS(
            'fill',
            await token(page, '--app-selection-color')
        );
        await page.screenshot({
            path: testInfo.outputPath(`discovery-${preset}.png`),
        });
        await gear.click();
        const settings = page.getByRole('dialog', {
            name: 'Discovery settings',
            exact: true,
        });
        await expectSurface(page, settings);
        const backdrop = await settings.evaluate(
            (el) => getComputedStyle(el, '::backdrop').backgroundColor
        );
        expect(backdrop).toBe(await token(page, '--app-popover-backdrop'));
        await page.keyboard.press('Escape');

        await page.getByLabel('Explore a region').selectOption('Sports');
        const league = page.getByRole('button', {
            name: 'LaLiga (Spain)',
            exact: true,
        });
        await expectSurface(page, league);
        await league.hover();
        await expect(league).toHaveCSS(
            'background-color',
            await token(page, '--app-card-hover-bg')
        );
        await league.click();
        await expect(league).toHaveCSS(
            'background-color',
            await token(page, '--app-selection-surface')
        );
        await expect(league).toHaveCSS(
            'color',
            await token(page, '--app-selection-text-color')
        );
        await page.screenshot({
            path: testInfo.outputPath(`discovery-sports-${preset}.png`),
        });
    });
}

test('Discovery follows System mode changes while the route is open', async ({
    page,
}) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await saveTheme(page, 'system');
    await page.goto('/discovery');
    await expectPalette(page, 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('body')).toHaveAttribute(
        'data-app-theme',
        'dark'
    );
    await expectPalette(page, 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('body')).toHaveAttribute(
        'data-app-theme',
        'light'
    );
    await expectPalette(page, 'light');
});

for (const preset of ['light', 'dark'] as const) {
    test(`Classification feedback inherits ${preset} status colors`, async ({
        page,
    }) => {
        await configureMockProviderBackend(page);
        await saveTheme(page, preset);
        await interceptXtreamRequests(page);
        await page.route('**/localhost:3000/xtream**', async (route) => {
            const action = new URL(route.request().url()).searchParams.get(
                'action'
            );
            if (action === 'get_live_categories') {
                await route.fulfill({
                    json: {
                        payload: [
                            {
                                category_id: 'palette',
                                category_name: 'US Sports English',
                                parent_id: 0,
                            },
                        ],
                    },
                });
            } else if (action === 'get_live_streams') {
                await route.fulfill({
                    json: {
                        payload: [
                            {
                                stream_id: 99001,
                                name: 'Synthetic palette channel',
                                category_id: 'palette',
                                stream_type: 'live',
                                stream_icon: '',
                            },
                        ],
                    },
                });
            } else await route.fallback();
        });
        await page.goto('/');
        await addXtreamPortal(page, { name: 'Synthetic palette source' });
        await page.goto('/discovery');
        await page
            .getByLabel('Discovery source')
            .selectOption({ label: 'Synthetic palette source' });
        await expect(page.locator('.channel-tile').first()).toBeVisible();
        await page
            .getByRole('button', { name: 'Discovery settings', exact: true })
            .click();
        await page
            .getByRole('dialog', { name: 'Discovery settings', exact: true })
            .getByRole('button', { name: 'Classifications', exact: true })
            .click();
        const dialog = page.getByRole('dialog', {
            name: 'Stream classifications',
            exact: true,
        });
        await expectSurface(page, dialog);
        await dialog
            .getByRole('button', {
                name: 'Classify current streams',
                exact: true,
            })
            .click();
        const notice = dialog.getByRole('status');
        await expect(notice).toHaveClass(/notice-success/);
        await expect(notice).toHaveCSS(
            'color',
            await token(page, '--app-success-color')
        );
        const chooser = page.waitForEvent('filechooser');
        await dialog
            .getByRole('button', { name: 'Import dictionary', exact: true })
            .click();
        await (
            await chooser
        ).setFiles({
            name: 'invalid-synthetic-dictionary.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify([{ id: 'invalid' }])),
        });
        await expect(notice).toHaveClass(/notice-error/);
        await expect(notice).toHaveCSS(
            'color',
            await token(page, '--app-danger-text')
        );
    });
}
