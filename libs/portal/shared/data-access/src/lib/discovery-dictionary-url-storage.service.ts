import { Injectable } from '@angular/core';
import { sourceProfileName } from '@iptvnator/services/source-sync/connection';

/** Shares the existing source/profile-scoped URL preference with refresh work. */
@Injectable({ providedIn: 'root' })
export class DiscoveryDictionaryUrlStorage {
    private key(id: string): string {
        return `${sourceProfileName()}:discovery-source-v1:dictionary-url:${id}`;
    }

    read(id: string): string {
        try {
            return id ? (localStorage.getItem(this.key(id)) ?? '') : '';
        } catch {
            return '';
        }
    }

    write(id: string, url: string): void {
        try {
            localStorage.setItem(this.key(id), url.trim());
        } catch {
            // Mapping persistence does not depend on this optional preference.
        }
    }
}
