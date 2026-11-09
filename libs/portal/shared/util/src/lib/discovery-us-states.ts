/** US states and the District of Columbia supported by the bundled map. */
export const DISCOVERY_US_STATES = [
    ['US-AL', 'Alabama'],
    ['US-AK', 'Alaska'],
    ['US-AZ', 'Arizona'],
    ['US-AR', 'Arkansas'],
    ['US-CA', 'California'],
    ['US-CO', 'Colorado'],
    ['US-CT', 'Connecticut'],
    ['US-DE', 'Delaware'],
    ['US-DC', 'District of Columbia'],
    ['US-FL', 'Florida'],
    ['US-GA', 'Georgia'],
    ['US-HI', 'Hawaii'],
    ['US-ID', 'Idaho'],
    ['US-IL', 'Illinois'],
    ['US-IN', 'Indiana'],
    ['US-IA', 'Iowa'],
    ['US-KS', 'Kansas'],
    ['US-KY', 'Kentucky'],
    ['US-LA', 'Louisiana'],
    ['US-ME', 'Maine'],
    ['US-MD', 'Maryland'],
    ['US-MA', 'Massachusetts'],
    ['US-MI', 'Michigan'],
    ['US-MN', 'Minnesota'],
    ['US-MS', 'Mississippi'],
    ['US-MO', 'Missouri'],
    ['US-MT', 'Montana'],
    ['US-NE', 'Nebraska'],
    ['US-NV', 'Nevada'],
    ['US-NH', 'New Hampshire'],
    ['US-NJ', 'New Jersey'],
    ['US-NM', 'New Mexico'],
    ['US-NY', 'New York'],
    ['US-NC', 'North Carolina'],
    ['US-ND', 'North Dakota'],
    ['US-OH', 'Ohio'],
    ['US-OK', 'Oklahoma'],
    ['US-OR', 'Oregon'],
    ['US-PA', 'Pennsylvania'],
    ['US-RI', 'Rhode Island'],
    ['US-SC', 'South Carolina'],
    ['US-SD', 'South Dakota'],
    ['US-TN', 'Tennessee'],
    ['US-TX', 'Texas'],
    ['US-UT', 'Utah'],
    ['US-VT', 'Vermont'],
    ['US-VA', 'Virginia'],
    ['US-WA', 'Washington'],
    ['US-WV', 'West Virginia'],
    ['US-WI', 'Wisconsin'],
    ['US-WY', 'Wyoming'],
] as const;

/** A state is optional and meaningful only within the United States. */
export function discoveryState(row: {
    country: string;
    state?: string;
}): string {
    return row.country === 'US' &&
        DISCOVERY_US_STATES.some(([id]) => id === row.state)
        ? (row.state ?? '')
        : '';
}

/** Country and subdivision availability includes every alternate in a catalog. */
export function discoveryLocationIds(
    rows: readonly { country: string; state?: string }[]
): string[] {
    const ids = new Set<string>();
    for (const row of rows) {
        if (row.country) ids.add(row.country);
        const state = discoveryState(row);
        if (state) ids.add(state);
    }
    return [...ids];
}
