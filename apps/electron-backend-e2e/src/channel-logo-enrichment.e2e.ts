import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { workspaceRoot } from '@nx/devkit';
import {
    addXtreamPortal,
    clickCategoryByNameExact,
    closeElectronApp,
    expect,
    launchElectronApp,
    test,
    type LaunchedElectronApp,
} from './electron-test-fixtures';
import { navigateWithinWorkspace } from './workspace-route.e2e-support';
import { readXtreamImportState } from './xtream-import-wait';

test('repairs missing/broken live logos, deduplicates variants and retains the cache offline after restart @electron @persistence', async ({
    dataDir,
}) => {
    test.setTimeout(180_000);
    const image = readFileSync(
        resolve(workspaceRoot, 'apps/web/src/assets/icons/icon-64.png')
    );
    let root = '';
    let online = true;
    let downloads = 0;
    let catalogs = 0;
    const server = createServer((req, res) => {
        if (!online) {
            res.writeHead(503);
            res.end();
            return;
        }
        if (req.url === '/channels.json') {
            catalogs++;
            res.setHeader('Content-Type', 'application/json');
            res.end(
                JSON.stringify([
                    {
                        id: 'ExampleNews.us',
                        name: 'Example News',
                        country: 'US',
                        alt_names: [],
                    },
                ])
            );
        } else if (req.url === '/logos.json') {
            catalogs++;
            res.setHeader('Content-Type', 'application/json');
            res.end(
                JSON.stringify([
                    {
                        channel: 'ExampleNews.us',
                        feed: null,
                        in_use: true,
                        format: 'PNG',
                        width: 64,
                        height: 64,
                        url: `${root}/logo.png`,
                    },
                ])
            );
        } else if (req.url === '/logo.png') {
            downloads++;
            res.setHeader('Content-Type', 'image/png');
            res.end(image);
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    if (!address || typeof address === 'string')
        throw new Error('Missing fixture server');
    root = `http://127.0.0.1:${address.port}`;
    let desktop: LaunchedElectronApp | null = null;
    const launch = () =>
        launchElectronApp(dataDir, { env: { IPTVNATOR_E2E_LOGO_ROOT: root } });
    try {
        desktop = await launch();
        let page = desktop.mainWindow;
        await page.emulateMedia({ colorScheme: 'light' });
        await addXtreamPortal(page, {
            name: 'Synthetic logo source',
            contentTypes: ['live'],
        });
        const importingSourceId = await page.evaluate(
            async () =>
                (await window.electron.dbGetAppPlaylists()).find(
                    (s) => s.title === 'Synthetic logo source'
                )!._id
        );
        // Provider import owns catalog replacement; seed only after its final write.
        await expect
            .poll(
                async () =>
                    (await readXtreamImportState(page, importingSourceId)).live
            )
            .toMatchObject({
                status: 'completed',
                hasCategories: true,
                hasContent: true,
            });
        const sourceId = await page.evaluate(async (root) => {
            const source = (await window.electron.dbGetAppPlaylists()).find(
                (s) => s.title === 'Synthetic logo source'
            )!;
            // The import APIs intentionally skip populated catalogs. Replace
            // only this isolated fixture's live cache before writing its rows.
            await window.electron.dbClearXtreamImportCache(source._id, 'live');
            await window.electron.dbSaveCategories(
                source._id,
                [
                    {
                        category_id: '770001',
                        category_name: 'Synthetic logos',
                        parent_id: 0,
                    },
                ],
                'live'
            );
            await window.electron.dbSaveContent(
                source._id,
                [
                    {
                        stream_id: 770001,
                        name: 'US | Example News HD',
                        category_id: '770001',
                        stream_type: 'live',
                        stream_icon: '',
                        epg_channel_id: 'ExampleNews.us',
                    },
                    {
                        stream_id: 770002,
                        name: 'US | Example News FHD',
                        category_id: '770001',
                        stream_type: 'live',
                        stream_icon: `${root}/broken.png`,
                        epg_channel_id: 'ExampleNews.us',
                    },
                    {
                        stream_id: 770003,
                        name: 'CA | Unlisted Event',
                        category_id: '770001',
                        stream_type: 'live',
                        stream_icon: '',
                    },
                ],
                'live'
            );
            await window.electron.dbSetAppState(
                `xtream-import-status:${source._id}:live`,
                'completed'
            );
            const saved = await window.electron.dbGetContentByXtreamId(
                770001,
                source._id,
                'live'
            );
            if (!saved)
                throw new Error('Synthetic logo fixture was not persisted');
            return source._id;
        }, root);
        await closeElectronApp(desktop);
        desktop = await launch();
        page = desktop.mainWindow;
        await page.emulateMedia({ colorScheme: 'light' });
        await navigateWithinWorkspace(page, '/workspace/settings/dictionary');
        const panel = page.getByTestId('channel-logo-settings');
        await expect(panel).toBeVisible();
        expect(downloads).toBe(0);
        expect(catalogs).toBe(0);
        await panel.getByRole('switch').click();
        await expect(panel.getByRole('switch')).toBeChecked();
        const refs = [770001, 770002].map((streamId) => ({
            sourceId,
            streamId,
        }));
        await expect
            .poll(
                async () => ({
                    resolved: await page.evaluate(
                        async (refs) =>
                            (await window.electron.channelLogoLookup!(refs))
                                .length,
                        refs
                    ),
                    status: await page.evaluate(() =>
                        window.electron.channelLogoControl!({
                            action: 'status',
                        })
                    ),
                    snapshot: JSON.stringify(
                        await page.evaluate(
                            async (ref) => ({
                                status: await window.electron
                                    .channelLogoControl!({ action: 'status' }),
                                content:
                                    !!(await window.electron.dbGetContentByXtreamId(
                                        ref.streamId,
                                        ref.sourceId,
                                        'live'
                                    )),
                            }),
                            refs[0]
                        )
                    ),
                    downloads,
                    catalogs,
                }),
                { timeout: 45_000 }
            )
            .toMatchObject({
                resolved: 2,
                downloads: 1,
                catalogs: 2,
                status: { enabled: true, error: '' },
                snapshot: expect.stringMatching(/"repaired":2/),
            });
        expect(downloads).toBe(1);
        expect(catalogs).toBe(2);
        await navigateWithinWorkspace(page, '/workspace/discovery');
        const repaired = page
            .locator('.channel-tile')
            .filter({ has: page.locator('h3', { hasText: 'Example News' }) })
            .locator('img.poster');
        await expect(repaired.first()).toHaveAttribute(
            'src',
            /^data:image\/png;base64,/,
            { timeout: 25_000 }
        );
        await expect
            .poll(() =>
                repaired
                    .first()
                    .evaluate(
                        (img: HTMLImageElement) =>
                            img.complete && img.naturalWidth > 0
                    )
            )
            .toBe(true);
        await page.emulateMedia({ colorScheme: 'dark' });
        await expect(repaired.first()).toBeVisible();
        // The regular Xtream list consumes the same validated fallback.
        await navigateWithinWorkspace(
            page,
            `/workspace/xtreams/${sourceId}/live`
        );
        await expect(
            page
                .locator('app-grid-list img[src^="data:image/png;base64,"]')
                .first()
        ).toBeVisible({ timeout: 25_000 });
        await clickCategoryByNameExact(page, 'Synthetic logos');
        const row = page
            .getByTestId('channel-item')
            .filter({ hasText: 'Example News HD' });
        await expect(row.locator('img.channel-logo')).toHaveAttribute(
            'src',
            /^data:image\/png;base64,/,
            { timeout: 25_000 }
        );
        await expect(
            page.evaluate(() =>
                window.electron.channelLogoLookup!([
                    { sourceId: '', streamId: -1 },
                ])
            )
        ).rejects.toThrow();
        const before = await page.evaluate(() =>
            window.electron.channelLogoControl!({ action: 'status' })
        );
        expect(before.unresolved).toBeGreaterThanOrEqual(1);
        online = false;
        await closeElectronApp(desktop);
        desktop = await launch();
        const retained = await desktop.mainWindow.evaluate(
            (refs) => window.electron.channelLogoLookup!(refs),
            refs
        );
        expect(retained).toHaveLength(2);
        expect(
            retained.every((r) =>
                r.dataUrl?.startsWith('data:image/png;base64,')
            )
        ).toBe(true);
        expect(downloads).toBe(1);
        expect(catalogs).toBe(2);
        await desktop.mainWindow.evaluate(() =>
            window.electron.channelLogoControl!({ action: 'pause' })
        );
        expect(
            await desktop.mainWindow.evaluate(
                (refs) => window.electron.channelLogoLookup!(refs),
                refs
            )
        ).toEqual([]);
    } finally {
        if (desktop) await closeElectronApp(desktop);
        await new Promise<void>((done, reject) =>
            server.close((error) => (error ? reject(error) : done()))
        );
    }
});
