import { resolveEpgFallback } from './resolve-epg-fallback';

describe('EPG source priority', () => {
    it('stops at the provider when it has programmes', async () => {
        const fetchBackup = jest.fn();
        expect(
            await resolveEpgFallback({
                preferUploaded: false,
                fetchProvider: async () => ['provider'],
                fetchBackup,
            })
        ).toEqual(['provider']);
        expect(fetchBackup).not.toHaveBeenCalled();
    });
    it.each([false, true])(
        'uses backup after provider empty/error (%s)',
        async (fails) => {
            expect(
                await resolveEpgFallback({
                    preferUploaded: false,
                    fetchProvider: async () => {
                        if (fails) throw new Error('Synthetic failure');
                        return [];
                    },
                    fetchBackup: async () => ['backup'],
                })
            ).toEqual(['backup']);
        }
    );
    it('preserves provider errors when neither source answers', async () => {
        await expect(
            resolveEpgFallback({
                preferUploaded: false,
                fetchProvider: async () => {
                    throw new Error('Synthetic failure');
                },
                fetchBackup: async () => [],
            })
        ).rejects.toThrow('Synthetic failure');
    });
    it('honours uploaded-first preference', async () => {
        const fetchProvider = jest.fn();
        expect(
            await resolveEpgFallback({
                preferUploaded: true,
                fetchProvider,
                fetchBackup: async () => ['backup'],
            })
        ).toEqual(['backup']);
        expect(fetchProvider).not.toHaveBeenCalled();
    });
});
