import { Injector } from '@angular/core';
import { DiscoveryMappingStorage } from '@iptvnator/portal/shared/data-access';

/** Loaded on first XMLTV miss to keep dictionary storage off the initial path. */
export function readEpgDictionary(injector: Injector, sourceId: string) {
    return injector.get(DiscoveryMappingStorage).read(sourceId);
}
