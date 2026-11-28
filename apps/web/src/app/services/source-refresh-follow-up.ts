import { DestroyRef, inject, Injector } from '@angular/core';
import { SourceCatalogUpdatesService } from '@iptvnator/services';
import { LazySnackBar } from '@iptvnator/services/lazy-snack-bar';
import { sourceProfileName } from '@iptvnator/services/source-sync/connection';
import { TranslateService } from '@ngx-translate/core';

/** Register immediately; dictionary/guide work loads only after a catalog commit. */
export function startSourceRefreshFollowUp(): void {
    const injector = inject(Injector);
    const lifetime = inject(DestroyRef);
    const profile = sourceProfileName();
    const active = () => !lifetime.destroyed && profile === sourceProfileName();
    const unregister = inject(SourceCatalogUpdatesService).afterRefresh(
        async (id) => {
            if (!active()) return;
            let service: typeof import('./source-refresh-follow-up.service');
            try {
                service = await import('./source-refresh-follow-up.service');
            } catch {
                if (active()) {
                    const translate = injector.get(TranslateService);
                    void injector.get(LazySnackBar).open(
                        translate.instant('EPG.SOURCE_REFRESH_FAILED', {
                            step: [
                                translate.instant('SETTINGS.NAV_DICTIONARY'),
                                translate.instant('SETTINGS.NAV_EPG'),
                            ].join(' / '),
                        }),
                        translate.instant('CLOSE'),
                        { duration: 7000 }
                    );
                }
                return;
            }
            if (active())
                await injector
                    .get(service.SourceRefreshFollowUpService)
                    .refresh(id, active);
        }
    );
    lifetime.onDestroy(unregister);
}
