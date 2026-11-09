import { InjectionToken } from '@angular/core';

/** Browser catalog owner supplies refresh without exposing portal stores to shared UI. */
export const BROWSER_XTREAM_REFRESH = new InjectionToken<
    (playlistId: string) => Promise<void>
>('BROWSER_XTREAM_REFRESH');
