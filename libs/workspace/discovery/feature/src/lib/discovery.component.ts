import { discoveryLocationIds } from '@iptvnator/portal/shared/util';
import { A11yModule } from '@angular/cdk/a11y';
import {
    CdkVirtualScrollViewport,
    ScrollingModule,
} from '@angular/cdk/scrolling';
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    ElementRef,
    inject,
    signal,
    viewChild,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ContentCardComponent } from '@iptvnator/portal/shared/ui';
import { PlaylistRefreshActionService } from '@iptvnator/playlist/shared/ui';
import { DiscoverySourceSession } from './discovery-source-session';
import { DiscoveryClassificationsComponent } from './discovery-classifications.component';
import {
    CATEGORIES,
    COUNTRIES,
    filterChannels,
    discoveryCategoryLabel,
    discoveryChannelLabel,
    LANGUAGES,
    LOCATIONS,
    QUALITIES,
    toggleSelection,
    toggleDiscoveryCategory,
    type ChannelMatch,
    type DiscoveryFilters,
} from './discovery-catalog';
import { DiscoveryGuideComponent } from './discovery-guide.component';
import { DiscoveryPlayerComponent } from './discovery-player.component';
import { DiscoveryMapComponent } from './discovery-map.component';

const PREFERENCES_KEY = 'iptvnator-discovery-prototype:v1';
function initialFilters(): DiscoveryFilters {
    const defaults: DiscoveryFilters = {
        locations: [],
        categories: [],
        languages: [],
        qualities: [],
        query: '',
    };
    try {
        const value = JSON.parse(
            localStorage.getItem(PREFERENCES_KEY) ?? 'null'
        );
        if (!value || typeof value !== 'object') return defaults;
        for (const [key, allowed] of [
            ['locations', LOCATIONS.map((l) => l.id)],
            ['categories', [...CATEGORIES.map((c) => c[0]), 'unclassified']],
            ['languages', [...LANGUAGES, 'Unknown']],
            ['qualities', QUALITIES],
        ] as const)
            defaults[key] = Array.isArray(value[key])
                ? value[key].filter((v: string) => allowed.some((a) => a === v))
                : [];
        defaults.query =
            typeof value.query === 'string' ? value.query.slice(0, 100) : '';
        if (defaults.categories.length > 1)
            defaults.categories = defaults.categories.filter(
                (c) => c !== 'unclassified'
            );
    } catch {
        /* The prototype also works without browser storage. */
    }
    return defaults;
}

@Component({
    selector: 'app-discovery',
    standalone: true,
    imports: [
        FormsModule,
        MatIcon,
        RouterLink,
        ScrollingModule,
        A11yModule,
        ContentCardComponent,
        DiscoveryMapComponent,
        DiscoveryPlayerComponent,
        DiscoveryGuideComponent,
        DiscoveryClassificationsComponent,
    ],
    providers: [DiscoverySourceSession],
    templateUrl: './discovery.component.html',
    styleUrl: './discovery.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { '(keydown)': 'navigate($event)' },
})
export class DiscoveryComponent {
    readonly catalog = inject(DiscoverySourceSession);
    readonly refreshAction = inject(PlaylistRefreshActionService);
    readonly currentPlaylist = computed(
        () =>
            this.catalog
                .sources()
                .find((s) => s._id === this.catalog.sourceId()) ?? null
    );
    readonly availableLocations = computed(() =>
        discoveryLocationIds(
            this.catalog.sourceId()
                ? this.catalog.rows()
                : this.catalog.channels()
        )
    );
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    readonly filters = signal(initialFilters());
    readonly region = signal('World');
    readonly selected = signal<ChannelMatch | null>(null);
    readonly sourceId = signal('');
    readonly watching = signal(false);
    readonly stack = signal<ChannelMatch | null>(null);
    readonly categories = CATEGORIES;
    readonly channelLabel = discoveryChannelLabel;
    readonly selectedCategoryNames = computed(() =>
        this.filters().categories.map(discoveryCategoryLabel).join(' + ')
    );
    readonly languages = [...LANGUAGES, 'Unknown'];
    readonly qualities = QUALITIES;
    readonly countries = COUNTRIES;
    readonly viewport = viewChild(CdkVirtualScrollViewport);
    readonly sourceDialog =
        viewChild.required<ElementRef<HTMLDialogElement>>('sourceDialog');
    readonly preferences =
        viewChild.required<ElementRef<HTMLDialogElement>>('preferences');
    readonly channels = computed(() =>
        filterChannels(this.catalog.channels(), this.filters())
    );
    readonly sourceCount = computed(() =>
        this.channels().reduce((sum, item) => sum + item.sources.length, 0)
    );
    readonly activeCount = computed(() => {
        const f = this.filters();
        return (
            f.locations.length +
            f.categories.length +
            f.languages.length +
            f.qualities.length +
            Number(Boolean(f.query))
        );
    });
    readonly locationNames = computed(() =>
        LOCATIONS.filter((l) => this.filters().locations.includes(l.id))
    );
    readonly categoryCounts = computed(() => {
        const channels = filterChannels(this.catalog.channels(), {
            ...this.filters(),
            categories: [],
        });
        return new Map(
            [...CATEGORIES.map(([key]) => key), 'unclassified'].map((key) => [
                key,
                channels.filter((c) =>
                    c.sources.some(
                        (source) =>
                            (source.facets?.category ?? c.channel.category) ===
                            key
                    )
                ).length,
            ])
        );
    });
    readonly filterChannelsCount = computed(
        () =>
            filterChannels(this.catalog.channels(), {
                ...this.filters(),
                categories: [],
            }).length
    );
    readonly playbackRow = computed(
        () =>
            this.catalog.rows().find((row) => row.id === this.sourceId()) ??
            null
    );
    readonly currentSource = computed(() =>
        this.selected()?.sources.find((s) => s.id === this.sourceId())
    );

    constructor() {
        effect(() => {
            try {
                localStorage.setItem(
                    PREFERENCES_KEY,
                    JSON.stringify(this.filters())
                );
            } catch {
                /* optional */
            }
        });
    }

    selectSource(id: string): void {
        this.catalog.select(id);
        this.clear();
        this.selected.set(null);
        this.watching.set(false);
    }
    showUnclassified(): void {
        this.toggle('categories', 'unclassified');
    }
    refreshSource(): void {
        const playlist = this.currentPlaylist();
        if (playlist) this.refreshAction.refresh(playlist);
    }

    toggle(
        dimension: 'locations' | 'categories' | 'languages' | 'qualities',
        value: string
    ): void {
        this.filters.update((f) => ({
            ...f,
            [dimension]:
                dimension === 'categories'
                    ? toggleDiscoveryCategory(f.categories, value)
                    : toggleSelection(f[dimension], value),
        }));
        this.viewport()?.scrollToOffset(0);
    }
    search(value: string): void {
        this.filters.update((f) => ({ ...f, query: value }));
        this.viewport()?.scrollToOffset(0);
    }
    clear(): void {
        this.filters.set({
            locations: [],
            categories: [],
            languages: [],
            qualities: [],
            query: '',
        });
        this.viewport()?.scrollToOffset(0);
    }
    clearCategories(): void {
        this.filters.update((f) => ({ ...f, categories: [] }));
        this.viewport()?.scrollToOffset(0);
    }
    pick(match: ChannelMatch, sourceId = match.sources[0].id): void {
        this.selected.set(match);
        this.sourceId.set(sourceId);
        this.watching.set(true);
    }
    showSources(match: ChannelMatch): void {
        this.stack.set(match);
        this.sourceDialog().nativeElement.showModal();
    }
    pickSource(match: ChannelMatch, sourceId: string): void {
        this.sourceDialog().nativeElement.close();
        this.pick(match, sourceId);
    }
    scroll(direction: number): void {
        const viewport = this.viewport();
        if (viewport)
            viewport.scrollToOffset(
                viewport.measureScrollOffset() +
                    direction * viewport.getViewportSize() * 0.85
            );
    }
    trackChannel(_index: number, match: ChannelMatch): string {
        return match.channel.id;
    }

    /** Spatial focus works across sidebars, map, cards and source controls. */
    navigate(event: KeyboardEvent): void {
        // Shared controls own playback shortcuts, including fullscreen Escape.
        if (
            (event.target as HTMLElement).closest(
                'app-discovery-player, app-discovery-guide'
            )
        )
            return;
        if (event.defaultPrevented) return;
        if (
            event.key === '/' &&
            (event.target as HTMLElement).tagName !== 'INPUT'
        ) {
            event.preventDefault();
            this.host.nativeElement
                .querySelector<HTMLInputElement>('input')
                ?.focus();
            return;
        }
        if (event.key === 'Escape' && this.watching()) {
            event.preventDefault();
            this.watching.set(false);
            return;
        }
        const direction = (
            {
                ArrowRight: [1, 0],
                ArrowLeft: [-1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
            } as Record<string, number[]>
        )[event.key];
        const target = event.target as HTMLElement;
        const tile = target.closest('.channel-tile');
        if (tile && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            const next =
                event.key === 'ArrowRight'
                    ? tile.nextElementSibling
                    : tile.previousElementSibling;
            const activation = next?.querySelector<HTMLElement>(
                '.content-card__activation'
            );
            event.preventDefault();
            activation?.focus();
            activation?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            return;
        }
        if (!direction || ['INPUT', 'SELECT'].includes(target.tagName)) return;
        const scope =
            target.closest('[role="dialog"], dialog') ??
            this.host.nativeElement;
        const box = target.getBoundingClientRect();
        const x = box.x + box.width / 2,
            y = box.y + box.height / 2;
        const candidates = Array.from(
            scope.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input, select, [role="button"][tabindex="0"]'
            )
        );
        const next = candidates
            .filter((el) => el !== target && !el.closest('[inert]'))
            .map((el) => {
                const rect = el.getBoundingClientRect();
                return {
                    el,
                    rect,
                    dx: rect.x + rect.width / 2 - x,
                    dy: rect.y + rect.height / 2 - y,
                };
            })
            .filter(
                (c) =>
                    c.rect.width > 0 &&
                    c.rect.height > 0 &&
                    c.dx * direction[0] + c.dy * direction[1] > 1
            )
            .sort(
                (a, b) =>
                    (a.dx ** 2 + a.dy ** 2) /
                        (a.dx * direction[0] + a.dy * direction[1]) -
                    (b.dx ** 2 + b.dy ** 2) /
                        (b.dx * direction[0] + b.dy * direction[1])
            )[0];
        if (next) {
            event.preventDefault();
            next.el.focus();
            next.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }
}
