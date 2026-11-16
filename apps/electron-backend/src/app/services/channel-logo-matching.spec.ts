import {
    LogoCatalogIndex,
    logoIdentity,
    logoNameKey,
    logoRetryDelay,
    LOGO_DAY,
} from '@iptvnator/shared/channel-enrichment';

describe('conservative channel logo identity', () => {
    const index = new LogoCatalogIndex();
    beforeAll(() => {
        index.add({
            id: 'Example.us',
            country: 'US',
            names: ['Example News', 'Example Noticias'],
            url: 'https://example.com/logo.png',
        });
        index.add({
            id: 'Example.ca',
            country: 'CA',
            names: ['Example News'],
            url: 'https://example.com/ca.png',
        });
        index.add({
            id: 'ExampleWest.us',
            country: 'US',
            names: ['Example News West'],
            url: 'https://example.com/west.png',
        });
        index.add({
            id: 'Conflict1.us',
            country: 'US',
            names: ['Conflict'],
            url: 'https://example.com/1.png',
        });
        index.add({
            id: 'Conflict2.us',
            country: 'US',
            names: ['Conflict'],
            url: 'https://example.com/2.png',
        });
    });
    it('uses an exact canonical EPG identifier', () =>
        expect(index.match('Provider title', 'Example.us')?.id).toBe(
            'Example.us'
        ));
    it.each(['HD', 'SD', 'FHD', 'UHD', '4K'])(
        'does not interpret terminal %s as a country',
        (quality) => {
            expect(
                index.match(`Example News | ${quality}`, 'Example.us')?.id
            ).toBe('Example.us');
            expect(index.match(`US | Example News | ${quality}`, '')?.id).toBe(
                'Example.us'
            );
        }
    );
    it('normalizes quality and explicit country prefix', () =>
        expect(index.match('US | Example News HD', '')?.id).toBe('Example.us'));
    it('uses an alias and country suffix', () =>
        expect(index.match('Example Noticias | US', '')?.id).toBe(
            'Example.us'
        ));
    it('keeps country variants separate', () =>
        expect(index.match('CA: Example News', '')?.id).toBe('Example.ca'));
    it('preserves regional suffixes', () =>
        expect(index.match('US | Example News West HD', '')?.id).toBe(
            'ExampleWest.us'
        ));
    it('abstains without country evidence', () =>
        expect(index.match('Example News HD', '')).toBeNull());
    it('abstains on an ambiguous alias', () =>
        expect(index.match('US | Conflict', '')).toBeNull());
    it('rejects country disagreement with exact ID', () =>
        expect(index.match('CA | Example News', 'Example.us')).toBeNull());
    it('rejects unknown event/24-hour names', () =>
        expect(index.match('US | 24/7 Example Stories', '')).toBeNull());
    it('does not erase channel numbers or time shifts', () =>
        expect(logoNameKey('Example 2 +1 HD')).toBe('example 2 +1'));
    it('normalizes Unicode', () =>
        expect(logoNameKey('Ｅxample HD')).toBe('example'));
    it('rejects conflicting country hints', () =>
        expect(logoIdentity('US | Example', 'CA').name).toBe(''));
    it('caps retries and schedules stable results infrequently', () => {
        expect(logoRetryDelay('failed', 100)).toBe(LOGO_DAY);
        expect(logoRetryDelay('unresolved', 1)).toBe(7 * LOGO_DAY);
        expect(logoRetryDelay('repaired', 1)).toBe(30 * LOGO_DAY);
    });
});
