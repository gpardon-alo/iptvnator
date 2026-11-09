import { COUNTRIES } from './discovery-locations';

export interface DiscoveryShape {
    id: string;
    name: string;
    region: string;
    x: number;
    y: number;
    path: string;
}

/** Schematic positions in the bundled SVG coordinate system for omitted islands. */
const ISLAND_POINTS: Record<string, [number, number]> = {
    AG: [328.4, 243.6],
    BB: [334.6, 257.2],
    DM: [329.6, 249.8],
    GD: [328.5, 261.7],
    KN: [325.7, 242.6],
    LC: [330.6, 254.7],
    VC: [330, 257],
    AI: [324.8, 237.5],
    AW: [305.6, 259.6],
    BQ: [310.3, 260.8],
    CW: [308.4, 260.8],
    KY: [274.3, 235.5],
    GP: [328.9, 246.4],
    MQ: [330.5, 251.9],
    MS: [327.2, 244.6],
    BL: [327, 239.4],
    MF: [324, 239.5],
    SX: [324, 241.6],
    TC: [300.6, 227],
    VG: [320.5, 237.8],
    VI: [320.1, 240.5],
};

export function discoveryWorldShapes(
    input: DiscoveryShape[]
): DiscoveryShape[] {
    const places = new Map(COUNTRIES.map((c) => [c.id, c]));
    const shapes = input.map((shape) => ({
        ...shape,
        name: places.get(shape.id)?.name ?? shape.name,
        region: places.get(shape.id)?.region ?? shape.region,
    }));
    // Natural Earth includes French Guiana in France's multipolygon. Give it
    // its own selectable territory without making the European map select it.
    const france = shapes.find((shape) => shape.id === 'FR');
    if (france && !shapes.some((shape) => shape.id === 'GF')) {
        const rings = france.path.match(/M[^M]+/g) ?? [];
        const guiana = rings.filter(
            (ring) => Number(ring.match(/^M([\d.]+)/)?.[1]) < 400
        );
        if (guiana.length) {
            france.path = rings
                .filter((ring) => !guiana.includes(ring))
                .join('');
            shapes.push({
                id: 'GF',
                name: 'French Guiana',
                region: 'South America',
                x: 352.8,
                y: 293.7,
                path: guiana.join(''),
            });
        }
    }
    for (const [id, [x, y]] of Object.entries(ISLAND_POINTS)) {
        const place = places.get(id);
        if (place && !shapes.some((shape) => shape.id === id))
            shapes.push({
                id,
                name: place.name,
                region: place.region,
                x,
                y,
                path: `M${x},${y - 1}l1,1l-1,1l-1,-1Z`,
            });
    }
    return shapes;
}
