import { provideHttpClient } from '@angular/common/http';
import {
    HttpTestingController,
    provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DiscoveryBaselineImport } from './discovery-baseline-import.service';
import { DiscoveryMappingStorage } from './discovery-mapping-storage.service';

describe('Discovery baseline source targeting', () => {
    let importer: DiscoveryBaselineImport;
    let http: HttpTestingController;
    let applyBaseline: jest.Mock;
    beforeEach(() => {
        applyBaseline = jest.fn().mockResolvedValue(undefined);
        TestBed.configureTestingModule({
            providers: [
                provideHttpClient(),
                provideHttpClientTesting(),
                {
                    provide: DiscoveryMappingStorage,
                    useValue: { applyBaseline },
                },
            ],
        });
        importer = TestBed.inject(DiscoveryBaselineImport);
        http = TestBed.inject(HttpTestingController);
    });
    afterEach(() => http.verify());
    it('targets only the existing source ID and leaves unrelated providers alone', async () => {
        const first = importer.apply('unrelated-source');
        const baseline = { sourceId: 'desktop-source', version: 1, rows: [] };
        http.expectOne('assets/discovery/classification-baseline.json').flush({
            schemaVersion: 1,
            baselines: [baseline],
        });
        await first;
        expect(applyBaseline).not.toHaveBeenCalled();
        await importer.apply('desktop-source');
        expect(applyBaseline).toHaveBeenCalledWith(baseline);
    });
    it('allows retry after an unavailable or malformed package asset', async () => {
        const failed = expect(
            importer.apply('desktop-source')
        ).rejects.toThrow();
        http.expectOne('assets/discovery/classification-baseline.json').flush({
            schemaVersion: 9,
        });
        await failed;
        expect(applyBaseline).not.toHaveBeenCalled();
        const retry = importer.apply('desktop-source');
        http.expectOne('assets/discovery/classification-baseline.json').flush({
            schemaVersion: 1,
            baselines: [],
        });
        await retry;
    });
});
