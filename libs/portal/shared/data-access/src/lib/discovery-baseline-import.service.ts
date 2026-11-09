import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
    parseDiscoveryBaseline,
    type DiscoveryBaselineManifest,
} from '@iptvnator/portal/shared/util';
import { DiscoveryMappingStorage } from './discovery-mapping-storage.service';

@Injectable({ providedIn: 'root' })
export class DiscoveryBaselineImport {
    private readonly http = inject(HttpClient);
    private readonly storage = inject(DiscoveryMappingStorage);
    private manifest?: Promise<DiscoveryBaselineManifest>;

    async apply(sourceId: string): Promise<void> {
        this.manifest ??= firstValueFrom(
            this.http.get<unknown>(
                'assets/discovery/classification-baseline.json'
            )
        )
            .then(parseDiscoveryBaseline)
            .catch((error) => {
                this.manifest = undefined;
                throw error;
            });
        const baseline = (await this.manifest).baselines.find(
            (entry) => entry.sourceId === sourceId
        );
        if (baseline) await this.storage.applyBaseline(baseline);
    }
}
