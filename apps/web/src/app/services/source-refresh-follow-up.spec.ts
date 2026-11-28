import { TestBed } from '@angular/core/testing';
import { SourceCatalogUpdatesService } from '@iptvnator/services';
import { SourceRefreshFollowUpService } from './source-refresh-follow-up.service';
import { startSourceRefreshFollowUp } from './source-refresh-follow-up';

describe('source refresh app registration', () => {
    const flush = async () => {
        for (let i = 0; i < 20; i++) await Promise.resolve();
    };
    let refresh: jest.Mock;
    beforeEach(() => {
        refresh = jest.fn().mockResolvedValue(undefined);
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: SourceRefreshFollowUpService,
                    useValue: { refresh },
                },
            ],
        });
    });

    it('does no refresh work until a successful catalog commit is reported', async () => {
        TestBed.runInInjectionContext(startSourceRefreshFollowUp);
        expect(refresh).not.toHaveBeenCalled();
        TestBed.inject(SourceCatalogUpdatesService).liveUpdated('synthetic');
        await flush();
        expect(refresh).toHaveBeenCalledWith('synthetic', expect.any(Function));
    });

    it('drops pending work when the app is destroyed during lazy loading', async () => {
        TestBed.runInInjectionContext(startSourceRefreshFollowUp);
        TestBed.inject(SourceCatalogUpdatesService).liveUpdated('synthetic');
        TestBed.resetTestingModule();
        await flush();
        expect(refresh).not.toHaveBeenCalled();
    });
});
