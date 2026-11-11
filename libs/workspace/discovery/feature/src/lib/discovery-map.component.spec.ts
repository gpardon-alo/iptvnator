import { provideHttpClient } from '@angular/common/http';
import {
    HttpTestingController,
    provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { COUNTRIES } from './discovery-catalog';
import { DiscoveryMapComponent } from './discovery-map.component';

describe('Discovery map asset transport', () => {
    beforeEach(() =>
        TestBed.configureTestingModule({
            imports: [DiscoveryMapComponent],
            providers: [provideHttpClient(), provideHttpClientTesting()],
        })
    );
    it('loads both maps through the application HTTP client', async () => {
        const fixture = TestBed.createComponent(DiscoveryMapComponent);
        const http = TestBed.inject(HttpTestingController);
        http.expectOne('assets/discovery/world.json').flush([]);
        http.expectOne('assets/discovery/states.json').flush([]);
        await Promise.resolve();
        expect(fixture.componentInstance.failed()).toBe(false);
        expect(fixture.componentInstance.listMode()).toBe(false);
        http.verify();
    });
    it('keeps the location-list fallback when an asset cannot be read', async () => {
        const fixture = TestBed.createComponent(DiscoveryMapComponent);
        const http = TestBed.inject(HttpTestingController);
        http.expectOne('assets/discovery/world.json').flush('', {
            status: 404,
            statusText: 'Missing',
        });
        http.expectOne('assets/discovery/states.json').flush([]);
        await Promise.resolve();
        expect(fixture.componentInstance.failed()).toBe(true);
        expect(fixture.componentInstance.listMode()).toBe(true);
        http.verify();
    });
    it('lists available countries alphabetically within the selected region', () => {
        const inventory = COUNTRIES.map((country) => country.id);
        const fixture = TestBed.createComponent(DiscoveryMapComponent);
        const http = TestBed.inject(HttpTestingController);
        http.expectOne('assets/discovery/world.json').flush([]);
        http.expectOne('assets/discovery/states.json').flush([]);
        fixture.componentRef.setInput('locationIds', ['US', 'PE', 'BR', 'AR']);
        expect(
            fixture.componentInstance.places().map((country) => country.name)
        ).toEqual(['Argentina', 'Brazil', 'Peru', 'United States']);
        fixture.componentRef.setInput('region', 'South America');
        expect(
            fixture.componentInstance.places().map((country) => country.name)
        ).toEqual(['Argentina', 'Brazil', 'Peru']);
        expect(COUNTRIES.map((country) => country.id)).toEqual(inventory);
        http.verify();
    });
});
