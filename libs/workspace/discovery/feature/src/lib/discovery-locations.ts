import { DISCOVERY_US_STATES } from '@iptvnator/portal/shared/util';
export interface DiscoveryLocation {
    id: string;
    name: string;
    region: string;
    /** Synthetic demo language only; never used to infer real stream language. */
    language: string;
}

/** Application discovery regions, including countries and separately selectable territories. */
export const COUNTRIES: DiscoveryLocation[] = [
    ['PE', 'Peru', 'South America', 'Spanish'],
    ['BR', 'Brazil', 'South America', 'Portuguese'],
    ['AR', 'Argentina', 'South America', 'Spanish'],
    ['CL', 'Chile', 'South America', 'Spanish'],
    ['CO', 'Colombia', 'South America', 'Spanish'],
    ['EC', 'Ecuador', 'South America', 'Spanish'],
    ['UY', 'Uruguay', 'South America', 'Spanish'],
    ['VE', 'Venezuela', 'South America', 'Spanish'],
    ['BO', 'Bolivia', 'South America', 'Spanish'],
    ['PY', 'Paraguay', 'South America', 'Spanish'],
    ['GY', 'Guyana', 'South America', 'English'],
    ['SR', 'Suriname', 'South America', 'Dutch'],
    ['GF', 'French Guiana', 'South America', 'French'],
    ['FK', 'Falkland Islands', 'South America', 'English'],
    ['BZ', 'Belize', 'Central America', 'English'],
    ['GT', 'Guatemala', 'Central America', 'Spanish'],
    ['SV', 'El Salvador', 'Central America', 'Spanish'],
    ['HN', 'Honduras', 'Central America', 'Spanish'],
    ['NI', 'Nicaragua', 'Central America', 'Spanish'],
    ['CR', 'Costa Rica', 'Central America', 'Spanish'],
    ['PA', 'Panama', 'Central America', 'Spanish'],
    ['AG', 'Antigua and Barbuda', 'Caribbean', 'English'],
    ['BS', 'Bahamas', 'Caribbean', 'English'],
    ['BB', 'Barbados', 'Caribbean', 'English'],
    ['CU', 'Cuba', 'Caribbean', 'Spanish'],
    ['DM', 'Dominica', 'Caribbean', 'English'],
    ['DO', 'Dominican Republic', 'Caribbean', 'Spanish'],
    ['GD', 'Grenada', 'Caribbean', 'English'],
    ['HT', 'Haiti', 'Caribbean', 'Haitian Creole'],
    ['JM', 'Jamaica', 'Caribbean', 'English'],
    ['KN', 'Saint Kitts and Nevis', 'Caribbean', 'English'],
    ['LC', 'Saint Lucia', 'Caribbean', 'English'],
    ['VC', 'Saint Vincent and the Grenadines', 'Caribbean', 'English'],
    ['TT', 'Trinidad and Tobago', 'Caribbean', 'English'],
    ['PR', 'Puerto Rico', 'Caribbean', 'Spanish'],
    ['AI', 'Anguilla', 'Caribbean', 'English'],
    ['AW', 'Aruba', 'Caribbean', 'Papiamento'],
    ['BQ', 'Bonaire, Sint Eustatius and Saba', 'Caribbean', 'Dutch'],
    ['CW', 'Curaçao', 'Caribbean', 'Papiamento'],
    ['KY', 'Cayman Islands', 'Caribbean', 'English'],
    ['GP', 'Guadeloupe', 'Caribbean', 'French'],
    ['MQ', 'Martinique', 'Caribbean', 'French'],
    ['MS', 'Montserrat', 'Caribbean', 'English'],
    ['BL', 'Saint Barthélemy', 'Caribbean', 'French'],
    ['MF', 'Saint Martin', 'Caribbean', 'French'],
    ['SX', 'Sint Maarten', 'Caribbean', 'English'],
    ['TC', 'Turks and Caicos Islands', 'Caribbean', 'English'],
    ['VG', 'British Virgin Islands', 'Caribbean', 'English'],
    ['VI', 'U.S. Virgin Islands', 'Caribbean', 'English'],
    ['US', 'United States', 'North America', 'English'],
    ['CA', 'Canada', 'North America', 'English'],
    ['MX', 'Mexico', 'North America', 'Spanish'],
    ['ES', 'Spain', 'Europe', 'Spanish'],
    ['FR', 'France', 'Europe', 'French'],
    ['GB', 'United Kingdom', 'Europe', 'English'],
    ['DE', 'Germany', 'Europe', 'German'],
    ['IT', 'Italy', 'Europe', 'Italian'],
    ['PT', 'Portugal', 'Europe', 'Portuguese'],
    ['NL', 'Netherlands', 'Europe', 'Dutch'],
    ['CH', 'Switzerland', 'Europe', 'German'],
    ['ZA', 'South Africa', 'Africa', 'English'],
    ['NG', 'Nigeria', 'Africa', 'English'],
    ['JP', 'Japan', 'Asia', 'Japanese'],
    ['IN', 'India', 'Asia', 'Hindi'],
    ['TR', 'Turkey', 'Asia', 'Turkish'],
    ['QA', 'Qatar', 'Asia', 'Arabic'],
    ['SA', 'Saudi Arabia', 'Asia', 'Arabic'],
    ['AU', 'Australia', 'Oceania', 'English'],
    ['NZ', 'New Zealand', 'Oceania', 'English'],
].map(([id, name, region, language]) => ({ id, name, region, language }));

export const STATES: DiscoveryLocation[] = DISCOVERY_US_STATES.map(
    ([id, name]) => ({
        id,
        name,
        region: 'United States',
        language: 'English',
    })
);
export const LOCATIONS = [...COUNTRIES, ...STATES];
export const LANGUAGES = [...new Set(COUNTRIES.map((c) => c.language))].sort();
