import { createServer } from 'node:http';
import {
    addXtreamPortal,
    closeElectronApp,
    expect,
    launchElectronApp,
    openSettings,
    openSettingsSection,
    openSources,
    refreshSource,
    saveSettings,
    test,
} from './electron-test-fixtures';
import { fetchXtreamLiveFixture } from './portal-mock-fixtures';
import { readXtreamImportState } from './xtream-import-wait';
import { navigateWithinWorkspace } from './workspace-route.e2e-support';

test('@electron @epg source refresh reloads the configured dictionary before replacing a fresh backup guide', async ({
    dataDir,
    request,
}) => {
    test.setTimeout(90000);
    let dictionary: unknown[] = [];
    let title = 'Synthetic initial programme';
    const requests: string[] = [];
    const stamp = (offset: number) =>
        new Date(Date.now() + offset)
            .toISOString()
            .replace(/[-:T]/g, '')
            .slice(0, 14);
    const server = createServer((req, res) => {
        requests.push(req.url ?? '');
        const isDictionary = req.url === '/dictionary.json';
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': isDictionary
                ? 'application/json'
                : 'application/xml',
        });
        res.end(
            isDictionary
                ? JSON.stringify(dictionary)
                : `<tv><channel id="Synthetic.example"><display-name>Synthetic TV</display-name></channel><programme channel="Synthetic.example" start="${stamp(-60000)} +0000" stop="${stamp(3600000)} +0000"><title>${title}</title></programme></tv>`
        );
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    if (!address || typeof address === 'string')
        throw new Error('Missing synthetic address');
    const root = `http://127.0.0.1:${address.port}`;
    const app = await launchElectronApp(dataDir);
    try {
        const stream = (await fetchXtreamLiveFixture(request)).items[0];
        const page = app.mainWindow;
        await addXtreamPortal(page, {
            name: 'Synthetic refresh source',
            username: 'minimal',
            password: 'minimal',
            contentTypes: ['live'],
        });
        const id = await page.evaluate(
            async () =>
                (await window.electron.dbGetAppPlaylists()).find(
                    (row) => row.title === 'Synthetic refresh source'
                )?._id ?? ''
        );
        expect(id).not.toBe('');
        await expect
            .poll(
                async () => (await readXtreamImportState(page, id)).live.status
            )
            .toBe('completed');
        dictionary = [
            {
                id: `local:${encodeURIComponent(id)}:live:${stream.stream_id}`,
                name: 'Synthetic initial channel',
                categories: ['United States', 'News', 'English'],
                provider: {
                    source_id: id,
                    stream_id: Number(stream.stream_id),
                    name: stream.name,
                },
                country: 'US',
                category: 'news',
                language: 'English',
                status: 'classified',
                origin: 'manual',
                ruleVersion: 1,
                epg: { xmltvId: 'Synthetic.example' },
            },
        ];
        await openSettings(page);
        await openSettingsSection(page, 'epg');
        await page.getByRole('button', { name: 'Add EPG source' }).click();
        await page
            .locator('.epg-source-row input')
            .first()
            .fill(`${root}/guide.xml`);
        await page.getByTestId('epg-source-refresh').click();
        const programmes = () =>
            page.evaluate(async () =>
                (
                    await window.electron.getChannelPrograms(
                        'Synthetic.example'
                    )
                ).map((row) => row.title)
            );
        await expect.poll(programmes).toEqual([title]);
        await saveSettings(page);
        await navigateWithinWorkspace(page, '/workspace/settings/dictionary');
        await page.getByLabel('Dictionary source').selectOption(id);
        const editor = page.locator('app-discovery-classifications');
        await editor
            .getByLabel('Dictionary URL', { exact: true })
            .fill(`${root}/dictionary.json`);
        await editor
            .getByRole('button', { name: 'Import from URL', exact: true })
            .click();
        await expect(editor.getByRole('status')).toContainText(
            'Imported 1 dictionary'
        );
        dictionary = dictionary.map((row) => ({
            ...(row as object),
            name: 'Synthetic refreshed channel',
        }));
        title = 'Synthetic refreshed programme';
        requests.length = 0;
        await page.evaluate(() =>
            localStorage.setItem(
                'iptvnator:discovery-source-v1',
                'synthetic-retired-source'
            )
        );
        // The Dictionary page is closed while the actual provider reimport runs.
        await openSources(page);
        await refreshSource(page, 'Synthetic refresh source', {
            confirm: true,
        });
        await expect.poll(programmes, { timeout: 60000 }).toEqual([title]);
        await expect(page).toHaveURL(/\/workspace\/discovery$/);
        await expect
            .poll(async () =>
                Number.parseInt(
                    await page.locator('.result-count').innerText(),
                    10
                )
            )
            .toBeGreaterThan(0);
        await expect(
            page.getByTestId('playlist-switcher-trigger')
        ).toContainText('Synthetic refresh source');
        await expect
            .poll(async () => (await readXtreamImportState(page, id)).live)
            .toMatchObject({ status: 'completed', hasContent: true });
        expect(requests.indexOf('/dictionary.json')).toBeGreaterThanOrEqual(0);
        expect(requests.indexOf('/guide.xml')).toBeGreaterThan(
            requests.indexOf('/dictionary.json')
        );
        await navigateWithinWorkspace(page, '/workspace/settings/dictionary');
        await page.getByLabel('Dictionary source').selectOption(id);
        await expect(editor.getByLabel('Search mappings')).toBeVisible();
        await editor.getByRole('button', { name: /^All mappings/ }).click();
        await expect(
            editor
                .locator('.mapping-row')
                .filter({ hasText: 'Synthetic refreshed channel' })
        ).toHaveCount(1);
    } finally {
        await closeElectronApp(app);
        await new Promise<void>((done) => server.close(() => done()));
    }
});
