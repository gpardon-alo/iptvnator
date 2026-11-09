import { discoveryMapFrame } from './discovery-map-framing';
import {
    ChangeDetectionStrategy,
    Component,
    computed,
    input,
    output,
    signal,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { COUNTRIES, STATES } from './discovery-catalog';
import {
    discoveryWorldShapes,
    type DiscoveryShape as Shape,
} from './discovery-map-shapes';
export const MAP_REGIONS = [
    'World',
    'South America',
    'North America',
    'Central America',
    'Caribbean',
    'Europe',
    'Africa',
    'Asia',
    'Oceania',
    'United States',
];

@Component({
    selector: 'app-discovery-map',
    standalone: true,
    imports: [MatIcon],
    templateUrl: './discovery-map.component.html',
    styleUrl: './discovery-map.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscoveryMapComponent {
    readonly locationIds = input<string[] | null>(null);
    readonly selected = input<string[]>([]);
    readonly region = input('World');
    readonly regionChange = output<string>();
    readonly locationToggle = output<string>();
    readonly regions = MAP_REGIONS;
    readonly listMode = signal(false);
    readonly focused = signal('');
    readonly world = signal<Shape[]>([]);
    readonly states = signal<Shape[]>([]);
    readonly failed = signal(false);
    readonly shapes = computed(() =>
        this.region() === 'United States'
            ? this.states()
            : this.world().filter(
                  (shape) =>
                      this.region() === 'World' ||
                      shape.region === this.region()
              )
    );
    readonly frame = computed(() => discoveryMapFrame(this.region()));
    readonly places = computed(() =>
        this.region() === 'United States'
            ? STATES.filter(
                  (s) =>
                      this.locationIds() === null ||
                      this.locationIds()?.includes(s.id)
              )
            : COUNTRIES.filter(
                  (c) =>
                      (this.region() === 'World' ||
                          c.region === this.region()) &&
                      (this.locationIds() === null ||
                          this.locationIds()?.includes(c.id))
              )
    );
    readonly available = computed(
        () => new Set(this.places().map((p) => p.id))
    );
    readonly labels = computed(() =>
        this.shapes().filter(
            (s) => this.selected().includes(s.id) || this.focused() === s.id
        )
    );
    readonly labelSize = computed(() =>
        this.region() === 'World' || this.region() === 'United States'
            ? 20
            : ['Central America', 'Caribbean'].includes(this.region())
              ? 3
              : 12
    );

    constructor() {
        void Promise.all(
            ['world', 'states'].map(async (kind) => {
                try {
                    const response = await fetch(
                        `assets/discovery/${kind}.json`
                    );
                    if (!response.ok) throw new Error('Map unavailable');
                    const shapes = (await response.json()) as Shape[];
                    if (kind === 'world')
                        this.world.set(discoveryWorldShapes(shapes));
                    else this.states.set(shapes);
                } catch {
                    this.failed.set(true);
                    this.listMode.set(true);
                }
            })
        );
    }

    mapKey(event: KeyboardEvent, shape: Shape): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.locationToggle.emit(shape.id);
            return;
        }
        const vector: Record<string, number[]> = {
            ArrowRight: [1, 0],
            ArrowLeft: [-1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
        };
        const direction = vector[event.key];
        if (!direction) return;
        const next = this.shapes()
            .filter((s) => this.available().has(s.id) && s.id !== shape.id)
            .map((s) => ({ shape: s, dx: s.x - shape.x, dy: s.y - shape.y }))
            .filter((s) => s.dx * direction[0] + s.dy * direction[1] > 0)
            .sort(
                (a, b) =>
                    (a.dx ** 2 + a.dy ** 2) /
                        (a.dx * direction[0] + a.dy * direction[1]) -
                    (b.dx ** 2 + b.dy ** 2) /
                        (b.dx * direction[0] + b.dy * direction[1])
            )[0];
        if (next) {
            event.preventDefault();
            document
                .getElementById(`discovery-region-${next.shape.id}`)
                ?.focus();
        }
    }
}
