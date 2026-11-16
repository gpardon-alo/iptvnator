import {
    DestroyRef,
    Injectable,
    effect,
    inject,
    signal,
    type Signal,
} from '@angular/core';
import {
    validLogoRef,
    type LogoControl,
    type LogoLookup,
    type LogoRepairStatus,
} from '@iptvnator/shared/channel-enrichment';

interface LogoWatch {
    ref: LogoLookup;
    url: string;
    hash: string;
    checked: number;
    listeners: Set<(url: string) => void>;
}

@Injectable({ providedIn: 'root' })
export class ChannelLogoService {
    private readonly bridge =
        typeof window !== 'undefined' ? window.electron : undefined;
    readonly supported =
        typeof this.bridge?.channelLogoLookup === 'function' &&
        typeof this.bridge?.channelLogoControl === 'function';
    readonly status = signal<LogoRepairStatus | null>(null);
    private readonly watches = new Map<string, LogoWatch>();
    private timer: ReturnType<typeof setInterval> | null = null;
    private flushing = false;
    private generation = 0;

    constructor() {
        inject(DestroyRef).onDestroy(() => {
            if (this.timer) clearInterval(this.timer);
        });
    }

    async control(request: LogoControl): Promise<void> {
        if (!this.supported) return;
        const generation =
            request.action === 'status' ? this.generation : ++this.generation;
        const status = await this.bridge!.channelLogoControl!(request);
        if (generation !== this.generation) return;
        this.status.set(status);
        if (!status.enabled) this.clearFallbacks();
        if (request.action !== 'status') {
            for (const watch of this.watches.values()) watch.checked = 0;
            void this.flush();
        }
    }

    private clearFallbacks(): void {
        for (const watch of this.watches.values()) {
            watch.url = '';
            watch.hash = '';
            for (const notify of watch.listeners) notify('');
        }
    }

    watch(ref: LogoLookup, callback: (url: string) => void): () => void {
        if (!this.supported || !validLogoRef(ref)) return () => undefined;
        const key = JSON.stringify([
            ref.sourceId,
            ref.streamId,
            ref.country ?? '',
        ]);
        let watch = this.watches.get(key);
        if (!watch) {
            // Retain only a bounded number of inactive thumbnail references.
            if (this.watches.size >= 500) {
                for (const [key, item] of this.watches) {
                    if (!item.listeners.size) {
                        this.watches.delete(key);
                        break;
                    }
                }
                if (this.watches.size >= 500) return () => undefined;
            }
            watch = {
                ref,
                url: '',
                hash: '',
                checked: 0,
                listeners: new Set(),
            };
            this.watches.set(key, watch);
        }
        watch.listeners.add(callback);
        callback(watch.url);
        if (!this.timer)
            this.timer = setInterval(() => void this.flush(), 15_000);
        void this.flush();
        return () => {
            watch!.listeners.delete(callback);
            if (
                ![...this.watches.values()].some(
                    (item) => item.listeners.size
                ) &&
                this.timer
            ) {
                clearInterval(this.timer);
                this.timer = null;
            }
        };
    }

    private async flush(): Promise<void> {
        if (this.flushing || !this.supported) return;
        this.flushing = true;
        const generation = this.generation;
        try {
            await this.control({ action: 'status' });
            if (generation !== this.generation || !this.status()?.enabled)
                return;
            const pending = [...this.watches.values()].filter(
                (w) => w.listeners.size && Date.now() - w.checked >= 10_000
            );
            for (let i = 0; i < pending.length; i += 50) {
                const batch = pending.slice(i, i + 50);
                const results = await this.bridge!.channelLogoLookup!(
                    batch.map((watch) => ({
                        ...watch.ref,
                        knownHash: watch.hash || undefined,
                    }))
                );
                if (generation !== this.generation || !this.status()?.enabled)
                    return;
                for (const watch of batch) {
                    watch.checked = Date.now();
                    const result = results.find(
                        (r) =>
                            r.sourceId === watch.ref.sourceId &&
                            r.streamId === watch.ref.streamId
                    );
                    if (!result) {
                        watch.hash = '';
                        watch.url = '';
                    } else {
                        watch.hash = result.hash;
                        watch.url = result.dataUrl ?? watch.url;
                    }
                    for (const notify of watch.listeners) notify(watch.url);
                }
            }
        } catch {
            /* Repair is optional: keep channel playback and existing cached artwork usable. */
        } finally {
            this.flushing = false;
        }
    }
}

/** Subscribe only when the provider artwork is absent or has actually failed. */
export function injectChannelLogoFallback(
    ref: () => LogoLookup | undefined,
    needed: () => boolean
): Signal<string> {
    const service = inject(ChannelLogoService);
    const url = signal('');
    effect((cleanup) => {
        const identity = ref();
        url.set('');
        if (identity && needed())
            cleanup(service.watch(identity, (value) => url.set(value)));
    });
    return url.asReadonly();
}

/** A grid shares the same bounded subscriptions as individual channel rows. */
export function injectChannelLogoMap(
    refs: () => LogoLookup[]
): Signal<ReadonlyMap<number, string>> {
    const service = inject(ChannelLogoService);
    const urls = signal<ReadonlyMap<number, string>>(new Map());
    effect((cleanup) => {
        urls.set(new Map());
        const releases = refs()
            .slice(0, 500)
            .map((ref) =>
                service.watch(ref, (url) => {
                    urls.update((previous) =>
                        new Map(previous).set(ref.streamId, url)
                    );
                })
            );
        cleanup(() => releases.forEach((release) => release()));
    });
    return urls.asReadonly();
}
