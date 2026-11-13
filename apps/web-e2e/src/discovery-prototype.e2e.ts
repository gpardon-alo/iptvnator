import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';
import { configureMockProviderBackend } from './provider-target-route';
import {
    addXtreamPortal,
    interceptXtreamRequests,
    routeLiveClip,
    selectWebPlayer,
} from './xtream-series-playback.fixture';

test.use({ viewport: { width: 1440, height: 900 } });

async function openClassifications(page: Page) {
    await page
        .getByRole('button', { name: 'Discovery settings', exact: true })
        .click();
    await page
        .getByRole('dialog', { name: 'Discovery settings', exact: true })
        .getByRole('button', { name: 'Classifications', exact: true })
        .click();
}

test('Discovery explores Central America, Caribbean islands and the complete South America list', async ({
    page,
}) => {
    await page.goto('/discovery');
    await page.getByLabel('Explore a region').selectOption('Central America');
    await expect(page.locator('.map-legend')).toContainText('7 locations');
    await page.getByRole('button', { name: 'Costa Rica', exact: true }).click();
    await expect(page.locator('.result-count')).toHaveText('11 channels');
    await page
        .getByRole('button', { name: 'Clear filters', exact: true })
        .click();
    await page.getByLabel('Explore a region').selectOption('Caribbean');
    await expect(page.locator('.map-legend')).toContainText('28 locations');
    await page
        .getByRole('button', { name: 'Puerto Rico', exact: true })
        .click();
    await expect(page.locator('.result-count')).toHaveText('11 channels');
    await page
        .getByRole('button', { name: 'Antigua and Barbuda', exact: true })
        .focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.result-count')).toHaveText('22 channels');
    await page.screenshot({ path: '../../dist/discovery-caribbean.png' });
    await page.getByRole('button', { name: 'Show location list' }).click();
    await expect(
        page
            .locator('.location-list')
            .getByRole('button', { name: /Puerto Rico/ })
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
        page
            .locator('.location-list')
            .getByRole('button', { name: /Antigua and Barbuda/ })
    ).toHaveAttribute('aria-pressed', 'true');
    await page
        .getByRole('button', { name: 'Clear filters', exact: true })
        .click();
    await page.getByLabel('Explore a region').selectOption('South America');
    for (const name of [
        'Bolivia',
        'Paraguay',
        'Guyana',
        'Suriname',
        'French Guiana',
    ]) {
        await page
            .locator('.location-list')
            .getByRole('button', { name: new RegExp(name) })
            .click();
    }
    await expect(page.locator('.result-count')).toHaveText('55 channels');
    await page.reload();
    await expect(page.locator('.result-count')).toHaveText('55 channels');
    await page.getByLabel('Explore a region').selectOption('South America');
    await expect(
        page.getByRole('button', { name: 'French Guiana', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
});

test('Discovery classifies a cached source, reviews unknowns and retains mappings on refresh', async ({
    page,
}) => {
    await configureMockProviderBackend(page);
    await page.goto('/');
    await interceptXtreamRequests(page);
    await routeLiveClip(page);
    await selectWebPlayer(page, 'HTML5 video player');
    let liveRequests = 0;
    const guideRequests: string[] = [];
    await page.route('**/localhost:3000/xtream**', async (route) => {
        const action = new URL(route.request().url()).searchParams.get(
            'action'
        );
        if (action === 'get_simple_data_table' || action === 'get_short_epg') {
            const streamId =
                new URL(route.request().url()).searchParams.get('stream_id') ??
                '';
            guideRequests.push(streamId);
            const start = Math.floor(Date.now() / 1000) - 900;
            await route.fulfill({
                json: {
                    payload: {
                        epg_listings: [
                            {
                                id: 'synthetic-program',
                                epg_id: 'synthetic-guide',
                                channel_id: streamId,
                                title: Buffer.from(
                                    'Synthetic guide ' + streamId
                                ).toString('base64'),
                                description: Buffer.from(
                                    'Synthetic programme details'
                                ).toString('base64'),
                                start_timestamp: String(start),
                                stop_timestamp: String(start + 3600),
                                start: new Date(start * 1000).toISOString(),
                                end: new Date(
                                    (start + 3600) * 1000
                                ).toISOString(),
                            },
                        ],
                    },
                },
            });
        } else if (action === 'get_live_categories') {
            await route.fulfill({
                json: {
                    payload: [
                        {
                            category_id: '801',
                            category_name: 'Peru Spanish',
                            parent_id: 0,
                        },
                        {
                            category_id: '802',
                            category_name: 'Peru',
                            parent_id: 0,
                        },
                    ],
                },
            });
        } else if (action === 'get_live_streams') {
            liveRequests++;
            await route.fulfill({
                json: {
                    payload: [
                        {
                            stream_id: 8101,
                            name: 'DAZN Synthetic | RD',
                            category_id: '801',
                            stream_type: 'live',
                            stream_icon: '',
                        },
                        {
                            stream_id: 8102,
                            name: 'Unspecified synthetic feed',
                            category_id: '801',
                            stream_type: 'live',
                            stream_icon: '',
                        },
                        {
                            stream_id: 8103,
                            name: 'PE: Pulse Sports Spanish English HD',
                            category_id: '802',
                            stream_type: 'live',
                            stream_icon: '',
                        },
                        {
                            stream_id: 8104,
                            name: 'PE: Unspecified extra feed Spanish English',
                            category_id: '802',
                            stream_type: 'live',
                            stream_icon: '',
                        },
                    ],
                },
            });
        } else await route.fallback();
    });
    await addXtreamPortal(page, { name: 'Synthetic classification source' });
    await expect(page.locator('app-grid-list').first()).toBeVisible();
    await page.goto('/discovery');
    const source = page.getByLabel('Discovery source');
    const option = source
        .locator('option')
        .filter({ hasText: 'Synthetic classification source' });
    await expect(option).toHaveAttribute('value', /.+/);
    const id = await option.getAttribute('value');
    await source.selectOption(id!);
    await expect(page.locator('.result-count')).toHaveText('4 channels');
    const ribbonNames = await page
        .locator('.channel-tile')
        .evaluateAll((cards) =>
            cards.map((card) => card.getAttribute('aria-label') ?? '')
        );
    expect(ribbonNames).toHaveLength(4);
    expect(ribbonNames).toEqual(
        [...ribbonNames].sort((a, b) =>
            a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })
        )
    );
    await expect(page.locator('.catalog-toolbar')).not.toContainText(
        'need review'
    );
    // Portal startup may already populate live data; Discovery reuses that cache.
    // Across startup and Discovery there must be exactly one live catalog fetch.
    await expect.poll(() => liveRequests).toBe(1);
    const cachedRequests = liveRequests;
    expect(
        await page
            .locator('.geography')
            .evaluate((el) => el.getBoundingClientRect().height)
    ).toBeGreaterThan(240);
    await expect(page.locator('.channel-viewport')).toBeVisible();
    await openClassifications(page);
    const dialog = page.getByRole('dialog', { name: 'Stream classifications' });
    await dialog
        .getByRole('button', { name: 'Classify current streams' })
        .click();
    await expect(
        dialog.getByRole('button', { name: 'Needs review (3)', exact: true })
    ).toBeVisible();
    await dialog.locator('.mapping-row').first().click();
    await expect(dialog.getByLabel('Mapping country')).toHaveValue('PE');
    await expect(dialog.getByLabel('Mapping language')).toHaveValue('Spanish');
    await dialog
        .getByLabel('Mapping display name')
        .fill('My synthetic channel');
    await dialog.getByLabel('Mapping category').selectOption('general');
    await dialog.getByRole('button', { name: 'Save classification' }).click();
    await expect(
        dialog.getByRole('button', { name: 'Needs review (2)', exact: true })
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'All mappings (4)' }).click();
    await expect(
        dialog
            .locator('.mapping-row')
            .filter({ hasText: 'DAZN Synthetic | RD' })
    ).toContainText('Dominican Republic · Sports · Spanish · Complete');
    const downloadEvent = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Export mapping JSON' }).click();
    const downloaded = await downloadEvent;
    expect(downloaded.suggestedFilename()).toBe(
        'discovery-classifications.json'
    );
    const dictionary = JSON.parse(
        await readFile((await downloaded.path()) ?? '', 'utf8')
    );
    const corrected = dictionary.find(
        (row: { name: string }) => row.name === 'My synthetic channel'
    );
    corrected.language = 'Portuguese';
    corrected.quality = 'HD';
    const importFile = {
        name: 'edited-dictionary.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify([corrected])),
    };
    const chooserEvent = page.waitForEvent('filechooser');
    await dialog
        .getByRole('button', { name: 'Import dictionary', exact: true })
        .click();
    await (await chooserEvent).setFiles(importFile);
    await expect(dialog.getByRole('status')).toContainText(
        'Imported 1 dictionary mappings'
    );
    await expect(dialog.getByRole('status')).toHaveClass(/notice-success/);
    const importedRow = dialog
        .locator('.mapping-row')
        .filter({ hasText: 'My synthetic channel' });
    await importedRow.click();
    await expect(dialog.getByLabel('Mapping language')).toHaveValue(
        'Portuguese'
    );
    // An invalid retry leaves the imported row intact, and the same file can be selected again.
    await dialog.getByLabel('Dictionary JSON file').setInputFiles({
        ...importFile,
        buffer: Buffer.from(
            JSON.stringify([corrected, { ...corrected, language: 'English' }])
        ),
    });
    await expect(dialog.getByRole('status')).toContainText(
        'Could not import dictionary'
    );
    await expect(dialog.getByLabel('Mapping language')).toHaveValue(
        'Portuguese'
    );
    await expect(dialog.getByRole('status')).toHaveClass(/notice-error/);
    await expect(dialog.getByRole('status')).toBeFocused();
    await page.setViewportSize({ width: 1024, height: 600 });
    await dialog.locator('.mapping-dialog-body').evaluate((el) => {
        el.scrollTop = el.scrollHeight;
    });
    await expect(
        dialog.getByRole('button', { name: 'Close classifications' })
    ).toBeInViewport();
    await dialog.locator('.mapping-dialog-body').evaluate((el) => {
        el.scrollTop = 0;
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(dialog.getByRole('status')).toContainText(
        'conflicting names or classifications'
    );
    await dialog.getByLabel('Dictionary JSON file').setInputFiles({
        ...importFile,
        buffer: Buffer.from(
            JSON.stringify([
                corrected,
                {
                    ...corrected,
                    provider: {
                        ...corrected.provider,
                        category_name: 'Synthetic alternate folder',
                    },
                },
            ])
        ),
    });
    await expect(dialog.getByRole('status')).toContainText(
        'Imported 1 dictionary mappings'
    );
    await page.screenshot({ path: '../../dist/discovery-classifications.png' });
    await dialog.getByRole('button', { name: 'Close classifications' }).click();
    await page.reload();
    await expect(source).toHaveValue(id!);
    await expect(page.locator('.result-count')).toHaveText('4 channels');
    expect(liveRequests).toBe(cachedRequests);
    await expect(
        page.getByRole('button', { name: 'My synthetic channel', exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'HD', exact: true }).click();
    await expect(page.locator('.result-count')).toHaveText('1 channel');
    await expect(page.locator('.channel-tile')).toContainText(
        'My synthetic channel'
    );
    await page.getByRole('button', { name: 'HD', exact: true }).click();
    await page.getByRole('button', { name: 'Unknown', exact: true }).click();
    await expect(page.locator('.result-count')).toHaveText('3 channels');
    await page.getByRole('button', { name: 'Unknown', exact: true }).click();
    await page
        .getByRole('button', { name: 'Discovery settings', exact: true })
        .click();
    await page
        .getByRole('dialog', { name: 'Discovery settings', exact: true })
        .getByRole('button', { name: 'Refresh source', exact: true })
        .click();
    await expect.poll(() => liveRequests).toBe(cachedRequests + 1);
    await expect(page.locator('.result-count')).toHaveText('4 channels');
    await expect(
        page.getByRole('button', { name: 'My synthetic channel', exact: true })
    ).toBeVisible();
    // A known genre stays visible with an unknown language. Counts match the ribbon.
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    await page.getByRole('button', { name: /^Sports/ }).click();
    await expect(page.getByRole('button', { name: /^Sports/ })).toContainText(
        '1'
    );
    await expect(page.locator('.result-count')).toHaveText('1 channel');
    await expect(page.locator('.channel-tile')).toHaveCount(1);
    await expect(page.locator('.channel-tile')).toContainText(
        'Peru · Sports · Unknown language'
    );
    await page
        .getByRole('button', { name: 'Unknown language', exact: true })
        .click();
    await expect(page.locator('.result-count')).toHaveText('1 channel');
    await page.getByRole('button', { name: /^Unclassified/ }).click();
    await expect(page.locator('.result-count')).toHaveText('1 channel');
    await expect(
        page.getByRole('button', { name: 'Peru', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
        page.getByRole('button', { name: 'Unknown language', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.channel-tile')).toContainText(
        'PE: Unspecified extra feed'
    );
    await page.getByRole('button', { name: /^Sports/ }).click();
    await expect(
        page.getByRole('button', { name: /^Unclassified/ })
    ).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.result-count')).toHaveText('1 channel');
    await expect(page.locator('.channel-tile')).toContainText(
        'PE: Pulse Sports Spanish English HD'
    );
    await page.screenshot({
        path: '../../dist/discovery-independent-facets.png',
    });
    await openClassifications(page);
    await dialog
        .getByLabel('Missing classification field')
        .selectOption('category');
    await expect(dialog.locator('.mapping-row')).toHaveCount(1);
    await dialog
        .getByLabel('Missing classification field')
        .selectOption('language');
    await expect(dialog.locator('.mapping-row')).toHaveCount(2);
    await expect(dialog.locator('.mapping-row').first()).toContainText(
        'Missing: language'
    );
    await dialog.getByRole('button', { name: 'All mappings (4)' }).click();
    const editedRow = dialog
        .locator('.mapping-row')
        .filter({ hasText: 'My synthetic channel' });
    await editedRow.click();
    await expect(dialog.getByLabel('Mapping language')).toHaveValue(
        'Portuguese'
    );
    await dialog.getByLabel('Mapping language').selectOption('');
    await dialog.getByRole('button', { name: 'Save classification' }).click();
    await expect(editedRow).toContainText('Unknown language');
    await dialog
        .getByRole('button', {
            name: 'Fill missing languages (1)',
            exact: true,
        })
        .click();
    await expect(editedRow).toContainText(
        'Peru · General TV · Spanish · Complete'
    );
    await expect(dialog.getByLabel('Mapping language')).toHaveValue('Spanish');
    await expect(
        dialog.getByRole('button', {
            name: 'Fill missing languages (0)',
            exact: true,
        })
    ).toBeDisabled();
    // Recover the old hidden Sports OR Unclassified selection without changing mappings.
    await page.evaluate(() => {
        const key = 'iptvnator-discovery-prototype:v1';
        const filters = JSON.parse(localStorage.getItem(key) ?? '{}');
        localStorage.setItem(
            key,
            JSON.stringify({
                ...filters,
                categories: ['sports', 'unclassified'],
            })
        );
    });
    await page.reload();
    await expect(page.locator('.result-count')).toHaveText('1 channel');
    await expect(
        page.getByRole('button', { name: /^Unclassified/ })
    ).toHaveAttribute('aria-pressed', 'false');
    // The editable root alone groups alternates, even with different facets.
    await page
        .getByRole('button', { name: 'Clear filters', exact: true })
        .click();
    await openClassifications(page);
    await dialog.getByRole('button', { name: 'All mappings (4)' }).click();
    const pulseRow = dialog
        .locator('.mapping-row')
        .filter({ hasText: 'PE: Pulse Sports Spanish English HD' });
    await pulseRow.click();
    await dialog
        .getByLabel('Mapping display name')
        .fill('My synthetic channel');
    await dialog.getByLabel('Mapping country').selectOption('DE');
    await dialog.getByText('Mapping JSON', { exact: true }).click();
    const draft = JSON.parse((await dialog.locator('pre').textContent())!);
    expect(draft.categories).toEqual(['Germany', 'Sports']);
    await dialog.getByRole('button', { name: 'Save classification' }).click();
    await dialog.getByRole('button', { name: 'Close classifications' }).click();
    await page.reload();
    await expect(page.locator('.result-count')).toHaveText('3 channels');
    await expect(page.locator('.ribbon-tools')).toContainText('4 streams');
    await expect(
        page.getByRole('button', { name: /^All channels/ })
    ).toContainText('3');
    await expect(page.getByRole('button', { name: /^Sports/ })).toContainText(
        '2'
    );
    // Germany remains available even though the group's first alternate is Peru.
    await page.getByRole('button', { name: 'Germany', exact: true }).click();
    await expect(page.locator('.result-count')).toHaveText('1 channel');
    await expect(page.locator('.channel-tile')).toContainText(
        'Germany · Sports · Unknown language'
    );
    await expect(page.locator('.ribbon-tools')).toContainText('1 streams');
    await page
        .getByRole('button', { name: 'Clear filters', exact: true })
        .click();
    await page
        .getByRole('button', {
            name: 'Choose source for My synthetic channel, Peru',
            exact: true,
        })
        .click();
    const chooser = page.locator('dialog[open]');
    await expect(chooser.locator('.source-option')).toHaveCount(2);
    await expect(chooser.locator('.source-option').first()).toContainText(
        'Unspecified synthetic feed'
    );
    await expect(chooser.locator('.source-option').last()).toContainText(
        'PE: Pulse Sports Spanish English HD'
    );
    await page.screenshot({ path: '../../dist/discovery-name-grouping.png' });
    expect(guideRequests).toEqual([]);
    const firstMedia = page.waitForRequest((request) =>
        /\/8103\.m3u8(?:\?|$)/.test(request.url())
    );
    await chooser
        .getByRole('button', { name: /PE: Pulse Sports Spanish English HD/ })
        .click();
    await expect(page.locator('.preview-info')).toContainText(
        'Germany · Unknown'
    );
    await firstMedia;
    await expect.poll(() => guideRequests).toContain('8103');
    const guide = page.locator('app-discovery-guide');
    await expect(
        guide.getByRole('button', { name: 'Synthetic guide 8103', exact: true })
    ).toBeVisible();
    const video = page.locator('.preview video');
    await expect(video).toBeVisible();
    await expect
        .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
        .toBeGreaterThan(0);
    await expect(video).toHaveJSProperty('paused', false);
    const alternate = page.getByLabel('Stream source');
    const switchedMedia = page.waitForRequest((request) =>
        /\/8102\.m3u8(?:\?|$)/.test(request.url())
    );
    await alternate.selectOption(`local:${encodeURIComponent(id!)}:live:8102`);
    await switchedMedia;
    await expect(
        guide.getByRole('button', { name: 'Synthetic guide 8102', exact: true })
    ).toBeVisible();
    await expect(
        guide.getByRole('button', { name: 'Synthetic guide 8103', exact: true })
    ).toHaveCount(0);
    await expect(page.locator('.preview-info')).toContainText('Peru · Spanish');
    await expect(video).toHaveJSProperty('paused', false);
    await expect
        .poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime))
        .toBeGreaterThan(0);
    const titleHeight = await guide
        .locator('.epg-timeline__block-title')
        .first()
        .evaluate((el) => el.getBoundingClientRect().height);
    expect(titleHeight).toBeGreaterThanOrEqual(14);
    const positions = await page.locator('.preview-info').evaluate((el) => {
        const children = [...el.children].map((child) =>
            child.getBoundingClientRect()
        );
        return children.map((rect) => ({
            left: rect.left,
            right: rect.right,
            top: rect.top,
        }));
    });
    expect(positions[1].left).toBeGreaterThan(positions[0].left);
    expect(positions[1].right).toBeLessThan(positions[2].left);
    await page.screenshot({ path: '../../dist/discovery-live-playback.png' });
    await video.focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('.preview video')).toHaveCount(0);
    await openClassifications(page);
    await dialog.getByRole('button', { name: 'All mappings (4)' }).click();
    await pulseRow.click();
    await dialog.getByLabel('Mapping display name').fill('Pulse separate root');
    await dialog.getByRole('button', { name: 'Save classification' }).click();
    await dialog.getByRole('button', { name: 'Close classifications' }).click();
    await page.reload();
    await expect(page.locator('.result-count')).toHaveText('4 channels');
    await expect(page.locator('.ribbon-tools')).toContainText('4 streams');
});

test('Discovery fits a full HD television without page scrolling', async ({
    page,
}) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/discovery');
    await expect(
        page.locator('app-discovery-map path.available').first()
    ).toBeVisible();
    await expect(
        page.getByRole('button', { name: 'Unknown', exact: true })
    ).toBeVisible();
    const layout = await page.locator('.discovery').evaluate((el) => {
        const topbar = el.querySelector('.topbar')!.getBoundingClientRect();
        const explorer = el.querySelector('.explorer')!.getBoundingClientRect();
        const map = el.querySelector('.geography')!.getBoundingClientRect();
        const cards = el
            .querySelector('.channel-viewport')!
            .getBoundingClientRect();
        return {
            toolbarBottom: topbar.bottom,
            explorerTop: explorer.top,
            mapHeight: map.height,
            cardsTop: cards.top,
            height: el.clientHeight,
        };
    });
    expect(layout.explorerTop - layout.toolbarBottom).toBeLessThanOrEqual(50);
    expect(layout.mapHeight).toBeGreaterThan(600);
    // The original ribbon stays anchored by the unchanged lower grid rows.
    expect(layout.cardsTop).toBeCloseTo(layout.height - 231, 0);
    const geometry = await page.locator('.discovery').evaluate((el) => ({
        height: el.clientHeight,
        scrollHeight: el.scrollHeight,
        width: el.clientWidth,
        scrollWidth: el.scrollWidth,
    }));
    expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.height + 1);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1);
    await page.screenshot({ path: '../../dist/discovery-prototype-tv.png' });
    await page.getByRole('link', { name: 'Return to IPTVnator' }).click();
    const shortcut = page.locator('[data-test-id="rail-discovery-prototype"]');
    await expect(shortcut).toBeVisible();
    await shortcut.click();
    await expect(page).toHaveURL(/\/discovery$/);
});

test('Discovery prototype filters mock channels, selects sources and preserves context', async ({
    page,
}) => {
    const providerCalls: string[] = [];
    page.on('request', (request) => {
        if (/\/(xtream|stalker)(\?|\/)/.test(request.url()))
            providerCalls.push(request.url());
    });
    await page.goto('/discovery');
    await expect(
        page.getByRole('heading', { name: 'Where will you watch today?' })
    ).toHaveCount(0);
    await expect(
        page.getByText('Your world. Your channels.', { exact: true })
    ).toHaveCount(0);
    await expect(
        page.getByText('FIND SOMETHING TO LOVE', { exact: true })
    ).toHaveCount(0);
    await expect(
        page.getByText('Live, everywhere', { exact: true })
    ).toHaveCount(0);
    await expect(
        page.locator('app-discovery-map path.available').first()
    ).toBeVisible();
    await expect(page.locator('.channel-tile').first()).toBeVisible();
    expect(await page.locator('.channel-tile').count()).toBeLessThan(25);
    await page.screenshot({
        path: '../../dist/discovery-prototype-desktop.png',
    });
    await page.getByLabel('Explore a region').selectOption('South America');
    await page.getByRole('button', { name: 'Peru', exact: true }).click();
    await expect(page.locator('.result-count')).toHaveText('11 channels');
    await page.getByRole('button', { name: /^News\b/ }).click();
    await page.getByRole('button', { name: /^Spanish/ }).click();
    await page.getByRole('button', { name: '4K', exact: true }).click();
    await expect(
        page.getByRole('heading', { name: 'No channels on this route.' })
    ).toBeVisible();
    await page.getByRole('button', { name: '4K', exact: true }).click();
    await page.getByRole('button', { name: 'FHD', exact: true }).click();
    await expect(page.locator('.result-count')).toHaveText('1 channel');
    await page.getByRole('button', { name: 'Marea News', exact: true }).click();
    const preview = page.getByRole('dialog', {
        name: 'Channel playback preview',
    });
    await expect(preview).toBeVisible();
    await expect(
        preview.getByText(
            'Demo channel · select a saved source to watch live video.'
        )
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);
    await expect(
        page.getByRole('button', { name: 'Peru', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
        page.getByRole('button', { name: 'FHD', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'FHD', exact: true }).click();
    await page
        .getByRole('button', { name: 'Choose source for Marea News, Peru' })
        .click();
    const sources = page.locator('dialog[open]');
    await sources.getByRole('button', { name: /Demo source 2/ }).click();
    await expect(page.getByLabel('Stream source')).toHaveValue(
        'demo-PE-news-1'
    );
    await page.getByLabel('Stream source').selectOption('demo-PE-news-0');
    await page.getByRole('button', { name: 'Back to discovery' }).click();
    await expect(page.locator('.result-count')).toHaveText('1 channel');
    await page.screenshot({
        path: '../../dist/discovery-prototype-filtered.png',
    });
    expect(providerCalls).toEqual([]);
});

test('Discovery location list, US state selection, keyboard map navigation and clear filters', async ({
    page,
}) => {
    await page.goto('/discovery');
    await page.getByRole('button', { name: 'Show location list' }).click();
    await expect(page.locator('.location-list button').first()).toBeVisible();
    const countryNames = await page
        .locator('.location-list button')
        .evaluateAll((buttons) =>
            buttons.map((button) =>
                [...button.childNodes]
                    .filter((node) => node.nodeType === Node.TEXT_NODE)
                    .map((node) => node.textContent)
                    .join('')
                    .trim()
            )
        );
    expect(countryNames.length).toBeGreaterThan(1);
    expect(countryNames).toEqual(
        [...countryNames].sort((a, b) => a.localeCompare(b, 'en'))
    );
    await page.getByRole('button', { name: 'Show map' }).click();
    await page.getByLabel('Explore a region').selectOption('United States');
    await page.getByRole('button', { name: 'California', exact: true }).click();
    await expect(page.locator('.result-count')).toHaveText('11 channels');
    await page.getByRole('button', { name: 'Show location list' }).click();
    await expect(
        page
            .locator('.location-list')
            .getByRole('button', { name: /California/ })
    ).toHaveAttribute('aria-pressed', 'true');
    await page
        .locator('.location-list')
        .getByRole('button', { name: /New York/ })
        .click();
    await expect(page.locator('.result-count')).toHaveText('22 channels');
    await page
        .getByRole('button', { name: 'Clear filters', exact: true })
        .click();
    await expect(page.locator('.result-count')).toHaveText('825 channels');
    await page.getByRole('button', { name: 'Show map' }).click();
    await page.getByLabel('Explore a region').selectOption('South America');
    const peru = page.getByRole('button', { name: 'Peru', exact: true });
    await peru.focus();
    await page.keyboard.press('Enter');
    await expect(peru).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(peru).not.toBeFocused();
    await page.getByLabel('Search channels').fill('no-such-demo-channel');
    await expect(
        page.getByRole('heading', { name: 'No channels on this route.' })
    ).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Search channels')).toHaveValue(
        'no-such-demo-channel'
    );
});

test('Saved US state classifications drive map availability, filtering and reload', async ({
    page,
}) => {
    await configureMockProviderBackend(page);
    await page.goto('/');
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
                            category_id: '901',
                            category_name: 'US News English',
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
                            stream_id: 8201,
                            name: 'US: Synthetic Local News English',
                            category_id: '901',
                            stream_type: 'live',
                            stream_icon: '',
                        },
                        {
                            stream_id: 8202,
                            name: 'US: Synthetic National News English',
                            category_id: '901',
                            stream_type: 'live',
                            stream_icon: '',
                        },
                    ],
                },
            });
        } else await route.fallback();
    });
    await addXtreamPortal(page, { name: 'Synthetic state source' });
    await page.goto('/discovery');
    const source = page.getByLabel('Discovery source');
    const id = await source
        .locator('option')
        .filter({ hasText: 'Synthetic state source' })
        .getAttribute('value');
    await source.selectOption(id!);
    await expect(page.locator('.result-count')).toHaveText('2 channels');
    await openClassifications(page);
    const editor = page.locator('dialog[open]');
    await editor
        .getByRole('button', { name: 'Classify current streams' })
        .click();
    await editor.getByRole('button', { name: 'All mappings (2)' }).click();
    await editor
        .locator('.mapping-row')
        .filter({ hasText: 'Synthetic Local' })
        .click();
    await expect(
        editor.getByLabel('Mapping state').locator('option')
    ).toHaveCount(52);
    await editor.getByLabel('Mapping state').selectOption('US-FL');
    await editor.getByRole('button', { name: 'Save classification' }).click();
    await expect(
        editor.locator('.mapping-row').filter({ hasText: 'Synthetic Local' })
    ).toContainText('Florida');
    await editor.getByRole('button', { name: 'Close classifications' }).click();
    await page.getByLabel('Explore a region').selectOption('United States');
    const florida = page.locator('#discovery-region-US-FL');
    await expect(florida).toHaveClass(/available/);
    await expect(page.locator('#discovery-region-US-OH')).not.toHaveClass(
        /available/
    );
    await page.getByRole('button', { name: 'Florida', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.result-count')).toHaveText('1 channel');
    await expect(page.locator('.channel-tile')).toContainText(
        'Florida, United States'
    );
    await expect(page.getByRole('button', { name: /^News/ })).toContainText(
        '1'
    );
    await page.reload();
    await expect(page.locator('.result-count')).toHaveText('1 channel');
    await page.getByLabel('Explore a region').selectOption('United States');
    await expect(
        page.getByRole('button', { name: 'Florida', exact: true })
    ).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Show location list' }).click();
    await expect(
        page.locator('.location-list').getByRole('button', { name: /Florida/ })
    ).toHaveAttribute('aria-pressed', 'true');
    await openClassifications(page);
    await editor.getByRole('button', { name: 'All mappings (2)' }).click();
    await editor
        .locator('.mapping-row')
        .filter({ hasText: 'Synthetic Local' })
        .click();
    await expect(editor.getByLabel('Mapping state')).toHaveValue('US-FL');
    await editor.getByLabel('Mapping state').selectOption('US-OH');
    await editor.getByRole('button', { name: 'Save classification' }).click();
    await editor.getByRole('button', { name: 'Close classifications' }).click();
    await page
        .locator('.catalog-toolbar')
        .getByRole('button', { name: 'Clear filters', exact: true })
        .click();
    await expect(page.locator('.result-count')).toHaveText('2 channels');
    await page
        .locator('.location-list')
        .getByRole('button', { name: /Ohio/ })
        .click();
    await expect(page.locator('.result-count')).toHaveText('1 channel');
    await page.getByRole('button', { name: 'Show map' }).click();
    await expect(page.locator('#discovery-region-US-OH')).toHaveClass(
        /available/
    );
    await expect(florida).not.toHaveClass(/available/);
    await page.screenshot({ path: '../../dist/discovery-saved-state.png' });
    await page
        .locator('.catalog-toolbar')
        .getByRole('button', { name: 'Clear filters', exact: true })
        .click();
    await page.getByLabel('Explore a region').selectOption('World');
    await page
        .getByRole('button', { name: 'United States', exact: true })
        .focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.result-count')).toHaveText('2 channels');
});

test('Discovery map framing fills the canvas without clipping across screen sizes', async ({
    page,
}) => {
    await page.goto('/discovery');
    for (const viewport of [
        { width: 1440, height: 900 },
        { width: 1920, height: 1080 },
    ]) {
        await page.setViewportSize(viewport);
        for (const region of [
            'World',
            'South America',
            'North America',
            'Africa',
            'Asia',
            'United States',
        ]) {
            await page.getByLabel('Explore a region').selectOption(region);
            const map = page.locator('app-discovery-map svg');
            await expect(map.locator('path').first()).toBeAttached();
            const geometry = await map.evaluate((svg) => {
                const content = svg.querySelector('g')!.getBoundingClientRect();
                const viewport = svg.getBoundingClientRect();
                const style = getComputedStyle(svg);
                return {
                    left:
                        content.left -
                        viewport.left -
                        parseFloat(style.paddingLeft),
                    right:
                        viewport.right -
                        parseFloat(style.paddingRight) -
                        content.right,
                    top:
                        content.top -
                        viewport.top -
                        parseFloat(style.paddingTop),
                    bottom:
                        viewport.bottom -
                        parseFloat(style.paddingBottom) -
                        content.bottom,
                    usedHeight:
                        content.height /
                        (viewport.height -
                            parseFloat(style.paddingTop) -
                            parseFloat(style.paddingBottom)),
                };
            });
            expect(geometry.left, region).toBeGreaterThanOrEqual(-1);
            expect(geometry.right, region).toBeGreaterThanOrEqual(-1);
            expect(geometry.top, region).toBeGreaterThanOrEqual(-1);
            expect(geometry.bottom, region).toBeGreaterThanOrEqual(-1);
            expect(geometry.usedHeight, region).toBeGreaterThan(0.8);
            if (viewport.width === 1920)
                await page.locator('.map-canvas').screenshot({
                    path: `../../dist/discovery-map-${region.toLowerCase().replace(/ /g, '-')}.png`,
                });
        }
    }
});

for (const theme of ['light', 'dark'] as const) {
    test(`Discovery shows all filters and compact settings in ${theme} mode`, async ({
        page,
    }) => {
        await page.emulateMedia({ colorScheme: theme });
        await page.goto('/discovery');
        await expect(page.locator('body')).toHaveClass(
            new RegExp(`${theme}-theme`)
        );
        const search = page.getByRole('textbox', { name: 'Search channels' });
        const clearSearch = page.getByRole('button', {
            name: 'Clear channel search',
            exact: true,
        });
        await expect(clearSearch).toBeHidden();
        await page
            .getByRole('button', { name: 'Discovery settings', exact: true })
            .focus();
        await page.keyboard.press('/');
        await expect(search).toBeFocused();
        await expect(search).toHaveValue('');
        await page.getByRole('button', { name: 'Peru', exact: true }).click();
        await page.getByRole('button', { name: /^Sports/ }).click();
        await page
            .getByRole('button', { name: 'Spanish', exact: true })
            .click();
        await page.getByRole('button', { name: 'HD', exact: true }).click();
        await page
            .getByRole('textbox', { name: 'Search channels' })
            .fill('Synthetic search');
        const summary = page.getByLabel('Active filters', { exact: true });
        for (const label of [
            'Peru',
            'Sports',
            'Spanish',
            'HD quality',
            'Search: “Synthetic search”',
        ]) {
            await expect(summary).toContainText(label);
        }
        await expect(page.locator('.filter-summary')).toContainText(
            '5 filters active'
        );
        await clearSearch.click();
        await expect(search).toHaveValue('');
        await expect(search).toBeFocused();
        await expect(clearSearch).toBeHidden();
        await expect(page.locator('.filter-summary')).toContainText(
            '4 filters active'
        );
        for (const label of ['Peru', 'Sports', 'Spanish', 'HD quality']) {
            await expect(summary).toContainText(label);
        }
        await search.fill('Synthetic search');
        const position = await page
            .locator('.filter-summary')
            .evaluate((el) => {
                const parent = el.parentElement;
                if (!parent) throw new Error('Filter summary must have a parent');
                return {
                    left: el.getBoundingClientRect().left,
                    parentLeft: parent.getBoundingClientRect().left,
                };
            });
        expect(position.left).toBeCloseTo(position.parentLeft, 0);
        const qualityGap = await page
            .locator('.quality')
            .evaluate(
                (el) =>
                    el
                        .getElementsByClassName('quality-options')[0]
                        .getBoundingClientRect().top -
                    el.getElementsByTagName('h2')[0].getBoundingClientRect()
                        .bottom
            );
        expect(qualityGap).toBeGreaterThanOrEqual(12);
        await page
            .locator('.filter-summary')
            .getByRole('button', { name: 'Clear filters', exact: true })
            .click();
        await expect(summary.locator('span')).toHaveCount(0);
        await page
            .getByRole('button', { name: 'Discovery settings', exact: true })
            .click();
        const settings = page.getByRole('dialog', {
            name: 'Discovery settings',
            exact: true,
        });
        await expect(settings.locator('.settings-actions > *')).toHaveCount(3);
        await expect(
            settings.getByRole('button', {
                name: 'Classifications',
                exact: true,
            })
        ).toBeDisabled();
        await expect(
            settings.getByRole('button', {
                name: 'Refresh source',
                exact: true,
            })
        ).toBeDisabled();
        await expect(
            settings.getByRole('link', { name: 'Return to main app' })
        ).toBeVisible();
        await page.screenshot({
            path: `../../dist/discovery-settings-${theme}.png`,
        });
        await page.keyboard.press('Escape');
        await expect(settings).not.toBeVisible();
        await expect(
            page.getByRole('button', {
                name: 'Discovery settings',
                exact: true,
            })
        ).toBeFocused();
    });
}

test('Discovery ribbon scrolls while hovering and stops when the pointer leaves', async ({
    page,
}) => {
    await page.goto('/discovery');
    const viewport = page.locator('.channel-viewport');
    const offset = () => viewport.evaluate((el) => el.scrollLeft);
    await expect(viewport).toBeVisible();
    await page
        .getByRole('button', { name: 'Next channels', exact: true })
        .hover();
    await expect.poll(offset).toBeGreaterThan(60);
    await page.getByRole('textbox', { name: 'Search channels' }).hover();
    const stopped = await offset();
    await viewport.evaluate(
        () =>
            new Promise<void>((resolve) => {
                let frames = 0;
                const frame = () =>
                    ++frames >= 12 ? resolve() : requestAnimationFrame(frame);
                requestAnimationFrame(frame);
            })
    );
    expect(await offset()).toBe(stopped);
    await page
        .getByRole('button', { name: 'Previous channels', exact: true })
        .hover();
    await expect.poll(offset).toBeLessThan(stopped);
    await page.getByRole('textbox', { name: 'Search channels' }).hover();
    const beforeClick = await offset();
    await page
        .getByRole('button', { name: 'Next channels', exact: true })
        .focus();
    await page.keyboard.press('Enter');
    await expect.poll(offset).toBeGreaterThan(beforeClick + 200);
});
