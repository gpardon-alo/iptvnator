import { effect, inject, untracked } from '@angular/core';
import { Router } from '@angular/router';
import type { DiscoverySourceSession } from './discovery-source-session';

/** Consume refresh intent once without pinning later manual source selection. */
export function selectDiscoveryRouteSource(
    catalog: DiscoverySourceSession
): void {
    const router = inject(Router, { optional: true });
    const navigation =
        router?.currentNavigation() ?? router?.lastSuccessfulNavigation();
    const info = navigation?.extras.info as
        { discoverySourceId?: unknown } | undefined;
    const id = info?.discoverySourceId;
    if (typeof id !== 'string' || !id) return;
    let applied = false;
    effect(() => {
        if (applied || !catalog.sources().some((source) => source._id === id))
            return;
        applied = true;
        untracked(() => catalog.select(id));
    });
}
