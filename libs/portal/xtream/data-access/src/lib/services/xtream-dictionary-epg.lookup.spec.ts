import { Injector } from '@angular/core';
import { DictionaryEpgService } from '@iptvnator/services/dictionary-epg';
import type { EpgItem } from '@iptvnator/shared/interfaces';
import { resolveXtreamEpg } from './xtream-dictionary-epg.lookup';

describe('Xtream dictionary EPG lookup', () => {
    it.each([0, 7, undefined])(
        'distinguishes a missing stream ID from %s',
        async (streamId) => {
            const programmes = [{ title: 'Synthetic bulletin' } as EpgItem];
            const idsFor = jest
                .fn()
                .mockResolvedValue(new Map([[streamId, 'News.example@SD']]));
            const injector = Injector.create({
                providers: [
                    { provide: DictionaryEpgService, useValue: { idsFor } },
                ],
            });
            const fetchXmltv = jest.fn().mockResolvedValue(programmes);
            const result = await resolveXtreamEpg(
                injector,
                {
                    playlistId: 'synthetic',
                    streamId,
                    epgChannelId: undefined,
                    preferUploaded: false,
                    fetchProvider: async () => [],
                },
                fetchXmltv
            );
            if (streamId === undefined) {
                expect(result).toEqual([]);
                expect(idsFor).not.toHaveBeenCalled();
                expect(fetchXmltv).not.toHaveBeenCalled();
            } else {
                expect(result).toEqual(programmes);
                expect(idsFor).toHaveBeenCalledWith('synthetic');
                expect(fetchXmltv).toHaveBeenCalledWith('News.example@SD');
            }
        }
    );
});
