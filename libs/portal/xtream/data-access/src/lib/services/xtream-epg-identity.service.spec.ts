import { TestBed } from '@angular/core/testing';
import { DictionaryEpgService } from '@iptvnator/services/dictionary-epg';
import { EpgItem } from '@iptvnator/shared/interfaces';
import { XtreamEpgIdentityService } from './xtream-epg-identity.service';
import { XtreamXmltvFallbackService } from './xtream-xmltv-fallback.service';

describe('Xtream dictionary previews', () => {
    it('batches unresolved dictionary IDs per source and retains provider-ID winners', async () => {
        const idsFor = jest.fn(
            async (source: string) =>
                new Map(
                    source === 'source-a'
                        ? [
                              [1, 'Dictionary.example'],
                              [2, 'Unused.example'],
                              [3, 'Shared.example'],
                          ]
                        : [[4, 'Other.example']]
                )
        );
        const program = { title: 'Synthetic dictionary programme' } as EpgItem;
        const getCurrentProgramsBatch = jest
            .fn()
            .mockResolvedValue({
                'Dictionary.example': program,
                'Other.example': program,
            });
        TestBed.configureTestingModule({
            providers: [
                { provide: DictionaryEpgService, useValue: { idsFor } },
                {
                    provide: XtreamXmltvFallbackService,
                    useValue: { getCurrentProgramsBatch },
                },
            ],
        });
        const streams = new Map<string, number[]>([['Shared.example', [2, 3]]]);
        const winner = { title: 'Provider-ID winner' } as EpgItem;
        const result: Record<string, EpgItem> = { 'Shared.example': winner };
        await TestBed.inject(XtreamEpgIdentityService).addDictionaryPreviews(
            [
                {
                    playlistId: 'source-a',
                    streamId: 1,
                    epgChannelId: 'Missing.example',
                },
                {
                    playlistId: 'source-a',
                    streamId: 2,
                    epgChannelId: 'Shared.example',
                },
                {
                    playlistId: 'source-a',
                    streamId: 3,
                    epgChannelId: 'Missing.example',
                },
                { playlistId: 'source-b', streamId: 4 },
            ],
            streams,
            result
        );
        expect(idsFor).toHaveBeenCalledTimes(2);
        expect(getCurrentProgramsBatch).toHaveBeenCalledWith([
            'Dictionary.example',
            'Shared.example',
            'Other.example',
        ]);
        expect(result['Shared.example']).toBe(winner);
        expect(
            [...streams.entries()]
                .filter(([key]) => result[key] === program)
                .map(([, ids]) => ids)
        ).toEqual([[1], [4]]);
    });
});
