import {
    DestroyRef,
    Injectable,
    InjectionToken,
    inject,
    signal,
} from '@angular/core';
import {
    createBrowserUserDataStorage,
    UserDataStorage,
} from './user-data-storage';

export interface ChannelIssueRef {
    sourceId: string;
    streamId: number;
    name: string;
    epgId?: string | null;
    country?: string;
}
export type ChannelIssueReason =
    'missing-url' | 'image-error' | 'empty-epg' | 'epg-error';
export interface ChannelIssue extends ChannelIssueRef {
    kind: 'logo' | 'epg';
    reason: ChannelIssueReason;
    firstSeen: number;
    lastSeen: number;
}
/** Deliberately device-local, even when other user data uses server storage. */
export const CHANNEL_ISSUE_STORAGE = new InjectionToken<UserDataStorage>(
    'CHANNEL_ISSUE_STORAGE',
    { providedIn: 'root', factory: createBrowserUserDataStorage }
);
const KEY = 'channel-issues-v1';
const LIMIT = 5000;
const REASONS: ChannelIssueReason[] = [
    'missing-url',
    'image-error',
    'empty-epg',
    'epg-error',
];

@Injectable({ providedIn: 'root' })
export class ChannelIssuesService {
    private readonly storage = inject(CHANNEL_ISSUE_STORAGE);
    private readonly records = signal<ChannelIssue[]>([]);
    readonly issues = this.records.asReadonly();
    readonly storageFailed = signal(false);
    private timer?: ReturnType<typeof setTimeout>;

    constructor() {
        try {
            const value: unknown = JSON.parse(
                this.storage.getItem(KEY) ?? '[]'
            );
            if (Array.isArray(value)) {
                const unique = new Map<string, ChannelIssue>();
                for (const item of value.slice(-LIMIT)) {
                    if (
                        !item ||
                        !REASONS.includes(item.reason) ||
                        !['logo', 'epg'].includes(item.kind) ||
                        !Number.isFinite(item.firstSeen) ||
                        !Number.isFinite(item.lastSeen)
                    )
                        continue;
                    const ref = this.clean(item);
                    if (ref)
                        unique.set(this.key(ref, item.kind), {
                            ...ref,
                            kind: item.kind,
                            reason: item.reason,
                            firstSeen: item.firstSeen,
                            lastSeen: item.lastSeen,
                        });
                }
                this.records.set([...unique.values()]);
            }
        } catch {
            this.storageFailed.set(true);
        }
        const flushOnPageHide = () => {
            if (this.timer !== undefined) this.flush();
        };
        window.addEventListener('pagehide', flushOnPageHide);
        inject(DestroyRef).onDestroy(() => {
            window.removeEventListener('pagehide', flushOnPageHide);
            this.flush();
        });
    }

    report(ref: ChannelIssueRef | undefined, reason: ChannelIssueReason): void {
        const clean = this.clean(ref);
        if (!clean) return;
        const kind: ChannelIssue['kind'] =
            reason === 'missing-url' || reason === 'image-error'
                ? 'logo'
                : 'epg';
        const key = this.key(clean, kind);
        const previous = this.records().find(
            (item) => this.key(item, item.kind) === key
        );
        const now = Date.now();
        if (
            previous &&
            previous.reason === reason &&
            previous.name === clean.name &&
            previous.epgId === clean.epgId &&
            previous.country === clean.country &&
            now - previous.lastSeen < 60_000
        )
            return;
        this.records.update((items) =>
            [
                ...items.filter((item) => this.key(item, item.kind) !== key),
                {
                    ...clean,
                    kind,
                    reason,
                    firstSeen: previous?.firstSeen ?? now,
                    lastSeen: now,
                },
            ].slice(-LIMIT)
        );
        this.save();
    }

    resolve(
        ref: ChannelIssueRef | undefined,
        kind: ChannelIssue['kind']
    ): void {
        if (!this.clean(ref)) return;
        const key = this.key(ref!, kind);
        const next = this.records().filter(
            (item) => this.key(item, item.kind) !== key
        );
        if (next.length === this.records().length) return;
        this.records.set(next);
        this.save();
    }

    exportJson(): string {
        return JSON.stringify(
            {
                schemaVersion: 1,
                generatedAt: new Date().toISOString(),
                issues: [...this.records()].sort(
                    (a, b) => b.lastSeen - a.lastSeen
                ),
            },
            null,
            2
        );
    }

    private clean(ref: ChannelIssueRef | undefined): ChannelIssueRef | null {
        if (
            !ref ||
            typeof ref.sourceId !== 'string' ||
            !ref.sourceId.trim() ||
            ref.sourceId.length > 200 ||
            !Number.isSafeInteger(ref.streamId) ||
            ref.streamId < 0 ||
            typeof ref.name !== 'string'
        )
            return null;
        return {
            sourceId: ref.sourceId,
            streamId: ref.streamId,
            name: ref.name.slice(0, 300),
            ...(typeof ref.epgId === 'string'
                ? { epgId: ref.epgId.slice(0, 300) }
                : {}),
            ...(typeof ref.country === 'string' &&
            /^[A-Z]{2}$/.test(ref.country)
                ? { country: ref.country }
                : {}),
        };
    }
    private key(ref: ChannelIssueRef, kind: ChannelIssue['kind']): string {
        return JSON.stringify([ref.sourceId, ref.streamId, kind]);
    }
    private save(): void {
        if (!this.timer) this.timer = setTimeout(() => this.flush(), 300);
    }
    private flush(): void {
        clearTimeout(this.timer);
        this.timer = undefined;
        try {
            this.storage.setItem(KEY, JSON.stringify(this.records()));
            this.storageFailed.set(false);
        } catch {
            this.storageFailed.set(true);
        }
    }
}
