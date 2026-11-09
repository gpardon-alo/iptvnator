import { inject, Injector, Provider } from '@angular/core';
import {
    PLAYLIST_DELETE_CLEANUP,
    BROWSER_XTREAM_REFRESH,
    DataService,
    resetHostConnectivityGuard,
    RuntimeCapabilitiesService,
} from '@iptvnator/services';
import { ElectronXtreamDataSource } from './electron-xtream-data-source';
import { PwaXtreamDataSource } from './pwa-xtream-data-source';
import {
    IXtreamDataSource,
    XTREAM_DATA_SOURCE,
} from './xtream-data-source.interface';

// Re-export all types and interfaces
export * from './xtream-data-source.interface';
export { ElectronXtreamDataSource } from './electron-xtream-data-source';
export { PwaXtreamDataSource } from './pwa-xtream-data-source';

/**
 * Factory function that returns the appropriate data source based on environment.
 * - Electron: Uses DatabaseService for DB-first caching
 * - PWA: Uses a 24-hour IndexedDB catalog cache and separate user-data storage
 */
export function xtreamDataSourceFactory(): IXtreamDataSource {
    const runtime = inject(RuntimeCapabilitiesService);

    if (runtime.supportsXtreamSqliteDataSource) {
        return inject(ElectronXtreamDataSource);
    }

    return inject(PwaXtreamDataSource);
}

/**
 * Provider for the Xtream data source.
 * Add this to your app providers to enable the data source abstraction.
 */
export function provideXtreamDataSource(
    factory: () => IXtreamDataSource = xtreamDataSourceFactory
): Provider[] {
    return [
        ElectronXtreamDataSource,
        PwaXtreamDataSource,
        {
            provide: BROWSER_XTREAM_REFRESH,
            useFactory: () => {
                const runtime = inject(RuntimeCapabilitiesService);
                const injector = inject(Injector);
                if (runtime.supportsXtreamSqliteDataSource) return null;
                return async (playlistId: string) => {
                    const source = injector.get(PwaXtreamDataSource);
                    const data = injector.get(DataService);
                    const playlist = await source.getPlaylist(playlistId);
                    await resetHostConnectivityGuard(data, playlist?.serverUrl);
                    await source.refreshCatalog(playlistId);
                    // Restart the active route/import with fresh catalogs, retaining user data.
                    window.location.reload();
                };
            },
        },
        {
            provide: XTREAM_DATA_SOURCE,
            useFactory: factory,
        },
        {
            provide: PLAYLIST_DELETE_CLEANUP,
            multi: true,
            useFactory: () => {
                const dataSource = inject(XTREAM_DATA_SOURCE);
                const runtime = inject(RuntimeCapabilitiesService);
                const injector = inject(Injector);

                return async (playlistId: string) => {
                    if (runtime.supportsXtreamSqliteDataSource) {
                        // Authoritative playlist deletion already removed SQLite rows.
                        // Remove only the dormant renderer-side restore record here.
                        const { XtreamDeferredCatalogRestoreService } =
                            await import('./xtream-deferred-restore');
                        injector
                            .get(XtreamDeferredCatalogRestoreService)
                            .clear(playlistId);
                        return;
                    }

                    return dataSource.deletePlaylist(playlistId);
                };
            },
        },
    ];
}
