import { TestBed } from '@angular/core/testing';
import { SourceCatalogUpdatesService } from './source-catalog-updates.service';
import { SourceActivityService } from './source-activity.service';

describe('source refresh follow-ups', () => {
    const flush = async () => {
        for (let i = 0; i < 12; i++) await Promise.resolve();
    };

    it('keeps the source busy and delays live notification until follow-ups finish', async () => {
        const updates = TestBed.inject(SourceCatalogUpdatesService);
        const activity = TestBed.inject(SourceActivityService);
        let finish!: () => void;
        const handler = jest.fn(
            () =>
                new Promise<void>((resolve) => {
                    finish = resolve;
                })
        );
        const completed = jest.fn();
        updates.liveUpdated$.subscribe(completed);
        updates.afterRefresh(handler);
        updates.liveUpdated('synthetic');
        updates.liveUpdated('synthetic');
        expect(activity.isBusy('synthetic')).toBe(true);
        await flush();
        expect(handler).toHaveBeenCalledTimes(1);
        expect(completed).not.toHaveBeenCalled();
        finish();
        await flush();
        expect(completed).toHaveBeenCalledWith('synthetic');
        expect(activity.isBusy('synthetic')).toBe(false);
    });

    it('runs a trailing follow-up for a newer catalog accepted during the first', async () => {
        const updates = TestBed.inject(SourceCatalogUpdatesService);
        const activity = TestBed.inject(SourceActivityService);
        const completed = jest.fn();
        updates.liveUpdated$.subscribe(completed);
        const finishes: (() => void)[] = [];
        const handler = jest.fn(
            () => new Promise<void>((resolve) => finishes.push(resolve))
        );
        updates.afterRefresh(handler);
        updates.sourceUpdated('synthetic');
        await flush();
        updates.liveUpdated('synthetic');
        updates.liveUpdated('synthetic');
        finishes[0]();
        await flush();
        expect(handler).toHaveBeenCalledTimes(2);
        expect(activity.isBusy('synthetic')).toBe(true);
        expect(completed).not.toHaveBeenCalled();
        finishes[1]();
        await flush();
        expect(completed).toHaveBeenCalledTimes(1);
        expect(activity.isBusy('synthetic')).toBe(false);
    });

    it('does not drop a queued catalog when the previous follow-up rejects', async () => {
        const updates = TestBed.inject(SourceCatalogUpdatesService);
        let fail!: () => void;
        const handler = jest
            .fn()
            .mockImplementationOnce(
                () =>
                    new Promise<void>((_, reject) => {
                        fail = () => reject(new Error('synthetic'));
                    })
            )
            .mockResolvedValue(undefined);
        updates.afterRefresh(handler);
        updates.liveUpdated('synthetic');
        await flush();
        updates.liveUpdated('synthetic');
        fail();
        await flush();
        expect(handler).toHaveBeenCalledTimes(2);
        expect(TestBed.inject(SourceActivityService).isBusy('synthetic')).toBe(
            false
        );
    });

    it('still publishes a saved catalog and releases activity if a follow-up fails', async () => {
        const updates = TestBed.inject(SourceCatalogUpdatesService);
        const completed = jest.fn();
        updates.liveUpdated$.subscribe(completed);
        updates.afterRefresh(async () => {
            throw new Error('synthetic failure');
        });
        updates.liveUpdated('synthetic');
        await flush();
        expect(completed).toHaveBeenCalledTimes(1);
        expect(TestBed.inject(SourceActivityService).isBusy('synthetic')).toBe(
            false
        );
    });

    it('leaves ordinary source refreshes on their fallback path without an app handler', () => {
        const updates = TestBed.inject(SourceCatalogUpdatesService);
        const completed = jest.fn();
        updates.liveUpdated$.subscribe(completed);
        const unregister = updates.afterRefresh(async () => undefined);
        unregister();
        expect(updates.sourceUpdated('synthetic')).toBe(false);
        updates.liveUpdated('synthetic');
        expect(completed).toHaveBeenCalledWith('synthetic');
    });
});
