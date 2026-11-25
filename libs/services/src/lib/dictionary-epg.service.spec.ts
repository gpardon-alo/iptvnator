import { TestBed } from '@angular/core/testing';
import {
    DictionaryEpgService,
    READ_EPG_DICTIONARY,
} from './dictionary-epg.service';

describe('DictionaryEpgService', () => {
    const read = jest.fn();
    beforeEach(() => {
        read.mockReset();
        TestBed.configureTestingModule({
            providers: [{ provide: READ_EPG_DICTIONARY, useValue: read }],
        });
    });
    it('uses only the owning source and exact stream ID, trimming XMLTV IDs', async () => {
        read.mockResolvedValue([
            {
                provider: { source_id: 'synthetic-a', stream_id: 7 },
                epg: { xmltvId: ' News.example@SD ' },
            },
            {
                provider: { source_id: 'synthetic-b', stream_id: 8 },
                epg: { xmltvId: 'Other.example' },
            },
            { provider: { source_id: 'synthetic-a', stream_id: 9 } },
        ]);
        expect(
            await TestBed.inject(DictionaryEpgService).idsFor('synthetic-a')
        ).toEqual(new Map([[7, 'News.example@SD']]));
        expect(read).toHaveBeenCalledWith('synthetic-a');
    });
    it('reads fresh dictionaries and tolerates unavailable storage', async () => {
        read.mockRejectedValueOnce(
            new Error('Unavailable')
        ).mockResolvedValueOnce([
            {
                provider: { source_id: 'synthetic-a', stream_id: 7 },
                epg: { xmltvId: 'Fresh.example' },
            },
        ]);
        const service = TestBed.inject(DictionaryEpgService);
        expect(await service.idsFor('synthetic-a')).toEqual(new Map());
        expect(await service.idsFor('synthetic-a')).toEqual(
            new Map([[7, 'Fresh.example']])
        );
    });
});
