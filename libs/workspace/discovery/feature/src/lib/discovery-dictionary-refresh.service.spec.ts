import { TestBed } from '@angular/core/testing';
import {
    DiscoveryDictionaryDownload,
    DiscoveryDictionaryUrlStorage,
    DiscoveryMappingStorage,
} from '@iptvnator/portal/shared/data-access';
import {
    classifyDiscoveryStream,
    type ClassifiedStream,
} from '@iptvnator/portal/shared/util';
import { XTREAM_DATA_SOURCE } from '@iptvnator/portal/xtream/data-access';
import { COUNTRIES } from './discovery-catalog';
import { DiscoveryDictionaryRefreshService } from './discovery-dictionary-refresh.service';

describe('dictionary reload after an accepted catalog refresh', () => {
    const makeRow = (stream_id: number) =>
        classifyDiscoveryStream(
            {
                source_id: 'synthetic',
                stream_id,
                name: 'Synthetic Channel',
            },
            COUNTRIES
        );
    let saved: ClassifiedStream[];
    let text: string;
    let currentUrl: string;
    let download: jest.Mock;
    let update: jest.Mock;
    let service: DiscoveryDictionaryRefreshService;

    beforeEach(() => {
        saved = [
            { ...makeRow(9), epg: { xmltvId: 'Synthetic.example' } },
            makeRow(10),
        ];
        text = JSON.stringify([
            { ...makeRow(9), name: 'Edited synthetic name' },
        ]);
        currentUrl = 'https://dictionary.example.test/mappings.json';
        download = jest.fn(async () => ({ text: async () => text }));
        update = jest.fn(async (_id, merge) => {
            saved = merge(saved);
        });
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: DiscoveryDictionaryDownload,
                    useValue: { download },
                },
                {
                    provide: DiscoveryDictionaryUrlStorage,
                    useValue: { read: () => currentUrl },
                },
                { provide: DiscoveryMappingStorage, useValue: { update } },
                {
                    provide: XTREAM_DATA_SOURCE,
                    useValue: {
                        getPlaylist: async () => ({
                            serverUrl: 'https://provider.example.test',
                        }),
                        getCategories: async () => [
                            { id: 1, name: 'Synthetic refreshed folder' },
                        ],
                        getContent: async () => [
                            {
                                xtream_id: 9,
                                title: 'Synthetic refreshed provider title',
                                category_id: 1,
                            },
                        ],
                    },
                },
            ],
        });
        service = TestBed.inject(DiscoveryDictionaryRefreshService);
    });

    it('merges validated rows with the latest provider evidence and retains unrelated mappings and optional EPG', async () => {
        await service.refresh('synthetic', async () => true);
        expect(saved).toHaveLength(2);
        expect(saved[0]).toMatchObject({
            name: 'Edited synthetic name',
            epg: { xmltvId: 'Synthetic.example' },
            provider: {
                name: 'Synthetic refreshed provider title',
                category_name: 'Synthetic refreshed folder',
            },
        });
        expect(saved[1].provider.stream_id).toBe(10);
    });

    it('does nothing without a configured URL', async () => {
        currentUrl = '';
        await service.refresh('synthetic', async () => true);
        expect(download).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it('retains mappings if the dictionary URL changes before the transaction reads them', async () => {
        const previous = saved;
        update.mockImplementationOnce(async (_id, merge) => {
            currentUrl = 'https://dictionary.example.test/replacement.json';
            saved = merge(saved);
        });
        await service.refresh('synthetic', async () => true);
        expect(saved).toBe(previous);
    });

    it('preserves omitted optional EPG fields while accepting explicit nulls', async () => {
        text = JSON.stringify([
            { ...makeRow(9), epg: { source: 'example.test' } },
        ]);
        await service.refresh('synthetic', async () => true);
        expect(saved[0].epg).toMatchObject({
            source: 'example.test',
            xmltvId: 'Synthetic.example',
        });
        text = JSON.stringify([{ ...makeRow(9), epg: { xmltvId: null } }]);
        await service.refresh('synthetic', async () => true);
        expect(saved[0].epg?.xmltvId).toBeNull();
    });

    it('validates the complete download before writing any mappings', async () => {
        text = JSON.stringify([makeRow(9), { invalid: true }]);
        await expect(
            service.refresh('synthetic', async () => true)
        ).rejects.toThrow();
        expect(update).not.toHaveBeenCalled();
        expect(saved[0].epg?.xmltvId).toBe('Synthetic.example');
    });

    it('discards a download after source ownership changes', async () => {
        await service.refresh('synthetic', async () => false);
        expect(update).not.toHaveBeenCalled();
    });

    it('discards a download when its configured URL changes', async () => {
        download.mockImplementation(async () => {
            currentUrl = 'https://dictionary.example.test/replacement.json';
            return { text: async () => text };
        });
        await service.refresh('synthetic', async () => true);
        expect(update).not.toHaveBeenCalled();
    });
});
