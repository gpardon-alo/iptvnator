// Keep Zone's fakeAsync helpers while preserving the Angular 21 test scheduler.
import 'zone.js';
import 'zone.js/testing';
import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';
import { webcrypto } from 'node:crypto';

// jsdom does not expose the browser's digest API.
Object.defineProperty(globalThis.crypto, 'subtle', { value: webcrypto.subtle });

setupZonelessTestEnv({
    errorOnUnknownElements: true,
    errorOnUnknownProperties: true,
});
