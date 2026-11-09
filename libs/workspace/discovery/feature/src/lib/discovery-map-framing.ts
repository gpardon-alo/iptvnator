/** Small presentation corrections for the existing bundled map projection. */
const FRAMES: Record<string, { viewBox: string; transform?: string }> = {
    World: {
        viewBox: '-54 -8 1108 526',
        transform: 'matrix(1.08 0 0 1 -40 0)',
    },
    'South America': {
        viewBox: '258 246 164 274',
        transform: 'matrix(1.12 0 0 1 -40.7 0)',
    },
    'North America': {
        viewBox: '10 -25 470 336',
        transform: 'matrix(1 0 0 1.1 0 -14.2)',
    },
    'Central America': { viewBox: '238 232 55 52' },
    Caribbean: { viewBox: '265 193 85 87' },
    Europe: { viewBox: '455 45 210 170' },
    Africa: {
        viewBox: '430 158 234 286',
        transform: 'matrix(1.1 0 0 1 -54.65 0)',
    },
    Asia: { viewBox: '560 86 360 278' },
    Oceania: { viewBox: '770 270 230 245' },
    'United States': {
        viewBox: '16 -14 880 520',
        transform: 'matrix(0.94 0 0 1.05 27.3 -12.2)',
    },
};

export function discoveryMapFrame(region: string): {
    viewBox: string;
    transform?: string;
} {
    return FRAMES[region] ?? FRAMES['World'];
}
