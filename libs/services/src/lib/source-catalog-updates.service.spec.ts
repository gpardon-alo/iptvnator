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
