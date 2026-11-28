import { TestBed } from '@angular/core/testing';
import { DiscoveryDictionaryUrlStorage } from './discovery-dictionary-url-storage.service';

describe('dictionary refresh URL preference', () => {
    beforeEach(() => localStorage.clear());
    it('uses the existing profile/source preference without moving stored URLs', () => {
        localStorage.setItem(
            'iptvnator:discovery-source-v1:dictionary-url:synthetic',
            'https://dictionary.example.test/mappings.json'
        );
        const storage = TestBed.inject(DiscoveryDictionaryUrlStorage);
        expect(storage.read('synthetic')).toBe(
            'https://dictionary.example.test/mappings.json'
        );
        expect(storage.read('other')).toBe('');
        storage.write('other', ' https://dictionary.example.test/other.json ');
        expect(storage.read('other')).toBe(
            'https://dictionary.example.test/other.json'
        );
    });
});
