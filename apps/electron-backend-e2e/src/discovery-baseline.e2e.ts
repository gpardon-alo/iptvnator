import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workspaceRoot } from '@nx/devkit';
import {
    addXtreamPortal,
    closeElectronApp,
    expect,
    launchElectronApp,
    restartElectronApp,
    test,
} from './electron-test-fixtures';
import { fetchXtreamLiveFixture } from './portal-mock-fixtures';

const stageBaseline = (filename = '') =>
    execFileSync(process.execPath, [
        join(
            workspaceRoot,
            'tools/packaging/discovery-baseline-before-pack.cjs'
        ),
        workspaceRoot,
        filename,
    ]);

test('Electron imports a packaged baseline through file assets without replacing source credentials', async ({
    dataDir,
    request,
}) => {
    let app = await launchElectronApp(dataDir);
    const directory = mkdtempSync(
        join(tmpdir(), 'discovery-baseline-electron-')
    );
    try {
        const fixture = await fetchXtreamLiveFixture(request);
        await addXtreamPortal(app.mainWindow, {
            name: 'Synthetic baseline source',
            contentTypes: ['live'],
        });
        await app.mainWindow.getByTestId('rail-discovery-prototype').click();
        const selector = app.mainWindow.getByLabel('Discovery source');
        const sourceId =
            (await selector
                .locator('option')
                .filter({ hasText: 'Synthetic baseline source' })
                .getAttribute('value')) ?? '';
        expect(sourceId).not.toBe('');
        const connection = () =>
            app.mainWindow.evaluate(async (id) => {
                const source = (await window.electron.dbGetAppPlaylists()).find(
                    (source) => source._id === id
                );
                if (!source) throw new Error('Synthetic source missing');
                return {
                    _id: source._id,
                    serverUrl: source.serverUrl,
                    username: source.username,
                    password: source.password,
                };
            }, sourceId);
        const before = await connection();
        const stream = fixture.items[0];
        const input = join(directory, 'baseline.json');
        writeFileSync(
            input,
            JSON.stringify({
                schemaVersion: 1,
                baselines: [
                    {
                        sourceId,
                        version: 1,
                        rows: [
                            {
                                id: `local:${encodeURIComponent(sourceId)}:live:${stream.stream_id}`,
                                name: 'Packaged synthetic root',
                                categories: [
                                    'United States',
                                    'News',
                                    'English',
                                ],
                                provider: {
                                    source_id: sourceId,
                                    stream_id: Number(stream.stream_id),
                                    name: stream.name,
                                },
                                country: 'US',
                                state: 'US-FL',
                                category: 'news',
                                language: 'English',
                                status: 'classified',
                                origin: 'manual',
                                ruleVersion: 4,
                            },
                        ],
                    },
                ],
            })
        );
        stageBaseline(input);
        app = await restartElectronApp(app, dataDir);
        await app.mainWindow.getByTestId('rail-discovery-prototype').click();
        await app.mainWindow
            .getByLabel('Discovery source')
            .selectOption(sourceId);
        await expect(
            app.mainWindow
                .locator('app-content-card')
                .filter({ hasText: 'Packaged synthetic root' })
        ).toBeAttached();
        expect(await connection()).toEqual(before);
        app = await restartElectronApp(app, dataDir);
        await app.mainWindow.getByTestId('rail-discovery-prototype').click();
        await expect(
            app.mainWindow
                .locator('app-content-card')
                .filter({ hasText: 'Packaged synthetic root' })
        ).toBeAttached();
        expect(await connection()).toEqual(before);
    } finally {
        await closeElectronApp(app);
        stageBaseline();
        rmSync(directory, { recursive: true, force: true });
    }
});
