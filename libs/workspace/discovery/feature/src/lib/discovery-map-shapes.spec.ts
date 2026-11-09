import { readFileSync } from 'node:fs';
import { COUNTRIES, LANGUAGES } from './discovery-locations';
import {
    discoveryWorldShapes,
    type DiscoveryShape,
} from './discovery-map-shapes';

const world = JSON.parse(
    readFileSync('apps/web/src/assets/discovery/world.json', 'utf8')
) as DiscoveryShape[];

describe('Discovery regional inventory and map', () => {
    it('lists all seven Central American countries and the Caribbean countries/territories separately', () => {
        expect(
            COUNTRIES.filter((c) => c.region === 'Central America')
                .map((c) => c.id)
                .sort()
        ).toEqual(['BZ', 'CR', 'GT', 'HN', 'NI', 'PA', 'SV']);
        const caribbean = COUNTRIES.filter((c) => c.region === 'Caribbean');
        expect(caribbean).toHaveLength(28);
        expect(caribbean.map((c) => c.id)).toEqual(
            expect.arrayContaining([
                'CU',
                'DO',
                'HT',
                'JM',
                'PR',
                'BS',
                'TT',
                'AG',
                'BB',
                'DM',
                'GD',
                'KN',
                'LC',
                'VC',
            ])
        );
        expect(new Set(COUNTRIES.map((c) => c.id)).size).toBe(COUNTRIES.length);
    });
    it('completes South America and retains the existing country IDs', () => {
        expect(
            COUNTRIES.filter((c) => c.region === 'South America').map(
                (c) => c.id
            )
        ).toEqual(
            expect.arrayContaining([
                'AR',
                'BO',
                'BR',
                'CL',
                'CO',
                'EC',
                'GY',
                'PY',
                'PE',
                'SR',
                'UY',
                'VE',
                'GF',
                'FK',
            ])
        );
        expect(LANGUAGES).toEqual(
            expect.arrayContaining(['Dutch', 'Haitian Creole', 'Papiamento'])
        );
    });
    it('provides a selectable polygon or marker for every supported country', () => {
        const shapes = discoveryWorldShapes(world);
        for (const country of COUNTRIES) {
            const shape = shapes.find((s) => s.id === country.id);
            expect(shape).toMatchObject({
                region: country.region,
                name: country.name,
            });
            expect(shape?.path).toBeTruthy();
        }
        const selectable = shapes.filter((s) =>
            COUNTRIES.some((c) => c.id === s.id)
        );
        expect(new Set(selectable.map((s) => s.id)).size).toBe(
            selectable.length
        );
    });
    it('supports the additional national feeds without changing existing regions', () => {
        for (const id of ['PT', 'NL', 'CH']) {
            expect(COUNTRIES.find((c) => c.id === id)?.region).toBe('Europe');
        }
        for (const id of ['TR', 'QA', 'SA']) {
            expect(COUNTRIES.find((c) => c.id === id)?.region).toBe('Asia');
        }
    });
    it('splits French Guiana from France and leaves the original asset intact', () => {
        const before = world.find((s) => s.id === 'FR')?.path;
        const shapes = discoveryWorldShapes(world);
        expect(shapes.find((s) => s.id === 'GF')?.region).toBe('South America');
        expect(shapes.find((s) => s.id === 'FR')?.path).not.toBe(before);
        expect(world.find((s) => s.id === 'FR')?.path).toBe(before);
        expect(discoveryWorldShapes(shapes)).toEqual(shapes);
    });
});
