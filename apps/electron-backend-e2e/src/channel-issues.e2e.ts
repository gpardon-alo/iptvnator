import { createServer } from 'node:http';
import {
    addXtreamPortal, closeElectronApp, expect, launchElectronApp, test,
    type LaunchedElectronApp,
} from './electron-test-fixtures';
import { navigateWithinWorkspace } from './workspace-route.e2e-support';
import { readXtreamImportState } from './xtream-import-wait';

test('desktop records rendered logo issues locally across restart without a repair service @electron @persistence', async ({ dataDir }) => {
    const server = createServer((_req, response) => { response.writeHead(404); response.end(); });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture address');
    const root = `http://127.0.0.1:${address.port}`;
    let app: LaunchedElectronApp | null = await launchElectronApp(dataDir);
    try {
        let page = app.mainWindow;
        await addXtreamPortal(page, { name: 'Synthetic issue source', contentTypes: ['live'] });
        const sourceId = await page.evaluate(async () => (await window.electron.dbGetAppPlaylists()).find((p) => p.title === 'Synthetic issue source')!._id);
        await expect.poll(async () => (await readXtreamImportState(page, sourceId)).live).toMatchObject({ status: 'completed', hasCategories: true, hasContent: true });
        await page.evaluate(async ({ sourceId, root }) => {
            await window.electron.dbClearXtreamImportCache(sourceId, 'live');
            await window.electron.dbSaveCategories(sourceId, [{ category_id: '991', category_name: 'Synthetic issues', parent_id: 0 }], 'live');
            await window.electron.dbSaveContent(sourceId, [
                { stream_id: 99101, name: 'Example Missing', category_id: '991', stream_type: 'live', stream_icon: '' },
                { stream_id: 99102, name: 'Example Broken', category_id: '991', stream_type: 'live', stream_icon: `${root}/broken.png` },
            ], 'live');
            await window.electron.dbSetAppState(`xtream-import-status:${sourceId}:live`, 'completed');
        }, { sourceId, root });
        await closeElectronApp(app);
        app = await launchElectronApp(dataDir);
        page = app.mainWindow;
        await navigateWithinWorkspace(page, '/workspace/discovery');
        await expect(page.locator('.result-count')).toHaveText('2 channels');
        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('channel-issues-v1') ?? '[]').length)).toBe(2);
        await navigateWithinWorkspace(page, '/workspace/settings/dictionary');
        await expect(page.locator('app-settings-channel-issues li')).toHaveCount(2);
        await expect(page.locator('app-settings-channel-issues')).toContainText('Logo failed to load');
        expect(await page.evaluate(() => typeof (window.electron as unknown as Record<string, unknown>)['channelLogoControl'])).toBe('undefined');
        await closeElectronApp(app);
        app = await launchElectronApp(dataDir);
        await navigateWithinWorkspace(app.mainWindow, '/workspace/settings/dictionary');
        await expect(app.mainWindow.locator('app-settings-channel-issues li')).toHaveCount(2);
    } finally {
        if (app) await closeElectronApp(app);
        await new Promise<void>((done) => server.close(() => done()));
    }
});
