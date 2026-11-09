import { TestBed } from '@angular/core/testing';
import { provideMockStore } from '@ngrx/store/testing';
import { selectAllPlaylistsMeta } from '@iptvnator/m3u-state';
import {
    DiscoveryBaselineImport,
    DiscoveryMappingStorage,
} from '@iptvnator/portal/shared/data-access';
import { XTREAM_DATA_SOURCE } from '@iptvnator/portal/xtream/data-access';
import { DiscoverySourceSession } from './discovery-source-session';

describe('Discovery source classification session', () => {
    const playlist = {
        id: 'synthetic',
        serverUrl: 'https://provider.example.test',
        username: 'demo',
        password: 'demo',
    };
    let storage: { read: jest.Mock; write: jest.Mock };
    let data: {
        getPlaylist: jest.Mock;
        getCategories: jest.Mock;
        getContent: jest.Mock;
    };
    let session: DiscoverySourceSession;
    beforeEach(() => {
        localStorage.clear();
        storage = {
            read: jest.fn().mockResolvedValue([]),
            write: jest.fn().mockResolvedValue(undefined),
        };
        data = {
            getPlaylist: jest.fn().mockResolvedValue(playlist),
            getCategories: jest
                .fn()
                .mockResolvedValue([
                    { category_id: '1', category_name: 'Peru Spanish' },
                ]),
            getContent: jest.fn().mockResolvedValue([
                {
                    xtream_id: 10,
                    category_id: '1',
                    title: 'PE: Solis News Spanish',
                },
            ]),
        };
        TestBed.configureTestingModule({
            providers: [
                DiscoverySourceSession,
                provideMockStore({
                    selectors: [
                        { selector: selectAllPlaylistsMeta, value: [] },
                    ],
                }),
                { provide: XTREAM_DATA_SOURCE, useValue: data },
                { provide: DiscoveryMappingStorage, useValue: storage },
                {
                    provide: DiscoveryBaselineImport,
                    useValue: { apply: jest.fn().mockResolvedValue(undefined) },
                },
            ],
        });
        session = TestBed.inject(DiscoverySourceSession);
        session.select('synthetic');
    });
    it('loads through the shared cache data source and classifies only on explicit action', async () => {
        await session.load();
        expect(session.pending()).toBe(1);
        expect(storage.write).not.toHaveBeenCalled();
        await session.classifyUnclassified();
        expect(session.rows()[0].categories).toEqual([
            'Peru',
            'News',
            'Spanish',
        ]);
        expect(storage.write).toHaveBeenCalledWith('synthetic', session.rows());
        expect(session.channels()[0].sources[0].quality).toBe('Unknown');
        storage.read.mockResolvedValue(session.rows());
        await session.load();
        expect(session.pending()).toBe(0);
    });
    it('preserves manual edits when reclassifying unknowns', async () => {
        await session.load();
        await session.edit({
            ...session.rows()[0],
            name: 'My channel',
            country: 'PE',
            category: 'news',
            language: '',
        });
        await session.classifyUnclassified();
        expect(session.rows()[0].name).toBe('My channel');
        expect(session.rows()[0].language).toBe('');
        expect(session.rows()[0].origin).toBe('manual');
    });
    it('preserves each known facet when another field is missing, including saved legacy statuses', async () => {
        await session.load();
        await session.edit({
            ...session.rows()[0],
            country: 'ES',
            category: 'sports',
            language: '',
        });
        expect(session.rows()[0].status).toBe('unclassified');
        expect(session.channels()[0]).toMatchObject({
            country: 'ES',
            category: 'sports',
            language: 'Unknown',
        });
        expect(session.unclassified()).toHaveLength(0);
        expect(session.needsReview()).toHaveLength(1);
        storage.read.mockResolvedValue(session.rows());
        await session.load();
        expect(session.channels()[0].category).toBe('sports');
        await session.edit({
            ...session.rows()[0],
            category: '',
            language: 'Spanish',
        });
        expect(session.channels()[0]).toMatchObject({
            category: 'unclassified',
            language: 'Spanish',
        });
        expect(session.unclassified()).toHaveLength(1);
    });
    it('fills languages on reviewed rows without overwriting other fields or existing languages', async () => {
        data.getCategories.mockResolvedValue([]);
        data.getContent.mockResolvedValue([
            { xtream_id: 10, title: 'Solis' },
            { xtream_id: 11, title: 'Marea' },
        ]);
        await session.load();
        await session.edit({
            ...session.rows()[0],
            name: 'Custom name',
            country: 'FR',
            category: 'sports',
            language: '',
        });
        await session.edit({
            ...session.rows()[1],
            country: 'FR',
            category: 'news',
            language: 'English',
        });
        const before = session.rows();
        expect(session.missingLanguagesWithDefault()).toHaveLength(1);
        await session.fillMissingLanguages();
        expect(session.rows()[0]).toMatchObject({
            name: 'Custom name',
            country: 'FR',
            category: 'sports',
            language: 'French',
            origin: 'manual',
            status: 'classified',
        });
        expect(session.rows()[1]).toEqual(before[1]);
        storage.read.mockResolvedValue(session.rows());
        await session.load();
        expect(session.rows()[0].language).toBe('French');
        storage.write.mockClear();
        await session.fillMissingLanguages();
        expect(storage.write).not.toHaveBeenCalled();
    });
    it('keeps the saved version when filling languages fails', async () => {
        await session.load();
        await session.edit({
            ...session.rows()[0],
            country: 'PE',
            language: '',
        });
        storage.write.mockRejectedValueOnce(new Error('quota'));
        await session.fillMissingLanguages();
        expect(session.rows()[0].language).toBe('');
        expect(session.notice()).toContain('Could not save');
    });
    it('regroups edited roots and restores the grouping after reload without merging saved stream records', async () => {
        data.getContent.mockResolvedValue([
            { xtream_id: 10, title: 'PE: Solis HD' },
            { xtream_id: 11, title: 'PE: Solis FHD' },
        ]);
        await session.load();
        expect(session.channels()).toHaveLength(2);
        await session.edit({ ...session.rows()[0], name: 'Solis' });
        await session.edit({ ...session.rows()[1], name: 'Solis' });
        expect(session.channels()).toHaveLength(1);
        expect(session.channels()[0].sources.map((s) => s.label)).toEqual([
            'PE: Solis HD',
            'PE: Solis FHD',
        ]);
        expect(storage.write.mock.calls.at(-1)[1]).toHaveLength(2);
        storage.read.mockResolvedValue(session.rows());
        await session.load();
        expect(session.channels()[0].sources).toHaveLength(2);
        await session.edit({ ...session.rows()[1], name: 'Solis Extra' });
        expect(session.channels()).toHaveLength(2);
        expect(session.rows()).toHaveLength(2);
    });
    it('uses portable Xtream IDs and folders when the runtime returns SQLite projections', async () => {
        data.getCategories.mockResolvedValue([
            { id: 77, xtream_id: 801, name: 'Peru Spanish' },
        ]);
        data.getContent.mockResolvedValue([
            {
                id: 99,
                xtream_id: 8101,
                category_id: 801,
                title: 'Solis Noticias',
            },
        ]);
        await session.load();
        await session.classifyUnclassified();
        expect(session.rows()[0].provider.stream_id).toBe(8101);
        expect(session.rows()[0].categories).toEqual([
            'Peru',
            'News',
            'Spanish',
        ]);
    });
    it('retains previous state when saving fails and supports retry', async () => {
        await session.load();
        storage.write.mockRejectedValueOnce(new Error('quota'));
        await session.classifyUnclassified();
        expect(session.pending()).toBe(1);
        expect(session.notice()).toContain('Could not save');
        await session.classifyUnclassified();
        expect(session.pending()).toBe(0);
    });
    it('recognizes newly supported countries in saved mappings without reclassification', async () => {
        await session.load();
        await session.edit({
            ...session.rows()[0],
            country: 'DO',
            category: 'sports',
            language: 'Spanish',
        });
        storage.read.mockResolvedValue(session.rows());
        await session.load();
        expect(session.channels()[0]).toMatchObject({
            country: 'DO',
            location: 'Dominican Republic',
            category: 'sports',
            language: 'Spanish',
        });
    });
    it('reclassifies a selected manual mapping only when explicitly requested', async () => {
        await session.load();
        await session.edit({ ...session.rows()[0], category: 'sports' });
        expect(session.rows()[0].origin).toBe('manual');
        await session.reclassify(session.rows()[0]);
        expect(session.rows()[0].category).toBe('news');
        expect(session.rows()[0].origin).toBe('rules');
    });
    it('does not expose a stale response after switching source', async () => {
        let finish!: (value: unknown) => void;
        data.getContent.mockReturnValueOnce(
            new Promise((resolve) => {
                finish = resolve;
            })
        );
        const loading = session.load();
        await Promise.resolve();
        session.select('other');
        finish([{ xtream_id: 11, title: 'Old source' }]);
        await loading;
        expect(session.rows()).toEqual([]);
    });
    it('does not replace unreadable mappings with empty storage', async () => {
        storage.read.mockRejectedValueOnce(new Error('corrupt'));
        await session.load();
        await session.classifyUnclassified();
        expect(session.error()).toBeTruthy();
        expect(storage.write).not.toHaveBeenCalled();
    });
    it('saves optional states, retains them after reload and clears them when changing country', async () => {
        await session.load();
        await session.edit({
            ...session.rows()[0],
            country: 'US',
            state: 'US-FL',
        });
        expect(storage.write).toHaveBeenLastCalledWith(
            'synthetic',
            expect.arrayContaining([
                expect.objectContaining({ state: 'US-FL' }),
            ])
        );
        storage.read.mockResolvedValue(session.rows());
        await session.load();
        expect(session.channels()[0]).toMatchObject({
            state: 'US-FL',
            location: 'Florida, United States',
        });
        await session.fillMissingLanguages();
        expect(session.rows()[0].state).toBe('US-FL');
        await session.edit({ ...session.rows()[0], country: 'PE' });
        expect(session.rows()[0].state).toBe('');
    });
});
