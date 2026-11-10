import {
    ChangeDetectionStrategy,
    Component,
    computed,
    ElementRef,
    inject,
    signal,
    viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
    discoveryMissingFields,
    finishDiscoveryClassification,
    type ClassifiedStream,
} from '@iptvnator/portal/shared/util';
import {
    CATEGORIES,
    COUNTRIES,
    LANGUAGES,
    STATES,
    discoveryCategoryLabel,
} from './discovery-catalog';
import { DiscoverySourceSession } from './discovery-source-session';

@Component({
    selector: 'app-discovery-classifications',
    standalone: true,
    imports: [FormsModule],
    templateUrl: './discovery-classifications.component.html',
    styleUrl: './discovery-classifications.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscoveryClassificationsComponent {
    readonly session = inject(DiscoverySourceSession);
    private readonly importStatus =
        viewChild<ElementRef<HTMLParagraphElement>>('importStatus');
    readonly countryGroups = [...new Set(COUNTRIES.map((c) => c.region))].map(
        (region) => ({
            region,
            countries: COUNTRIES.filter((c) => c.region === region),
        })
    );
    readonly states = STATES;
    readonly stateLabel = (id?: string) =>
        STATES.find((s) => s.id === id)?.name;
    readonly genres = CATEGORIES;
    readonly languages = LANGUAGES;
    readonly unknownOnly = signal(true);
    readonly missingDimension = signal('any');
    readonly categoryLabel = discoveryCategoryLabel;
    readonly countryLabel = (id: string) =>
        COUNTRIES.find((c) => c.id === id)?.name ?? 'Unknown country';
    readonly missingLabel = (row: ClassifiedStream) => {
        const missing = discoveryMissingFields(row);
        return missing.length ? `Missing: ${missing.join(', ')}` : 'Complete';
    };
    readonly query = signal('');
    readonly page = signal(0);
    readonly draft = signal<ClassifiedStream | null>(null);
    readonly matches = computed(() =>
        this.session
            .rows()
            .filter(
                (r) =>
                    (!this.unknownOnly() ||
                        (this.missingDimension() === 'any'
                            ? discoveryMissingFields(r).length > 0
                            : discoveryMissingFields(r).includes(
                                  this.missingDimension()
                              ))) &&
                    `${r.name} ${r.provider.name}`
                        .toLowerCase()
                        .includes(this.query().toLowerCase())
            )
    );
    readonly visible = computed(() =>
        this.matches().slice(this.page() * 30, (this.page() + 1) * 30)
    );
    readonly pages = computed(() =>
        Math.max(1, Math.ceil(this.matches().length / 30))
    );
    readonly json = computed(() => {
        const row = this.draft();
        return JSON.stringify(
            row ? finishDiscoveryClassification(row, COUNTRIES) : null,
            null,
            2
        );
    });
    async reclassify(): Promise<void> {
        const row = this.draft();
        if (!row) return;
        await this.session.reclassify(row);
        const saved = this.session.rows().find((r) => r.id === row.id);
        if (saved) this.select(saved);
    }
    async importDictionary(input: HTMLInputElement): Promise<void> {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        const importing = this.session.importDictionary(file);
        this.importStatus()?.nativeElement.focus();
        await importing;
        this.importStatus()?.nativeElement.focus();
        this.page.set(0);
        const selected = this.session
            .rows()
            .find((row) => row.id === this.draft()?.id);
        if (selected) this.select(selected);
    }
    async fillLanguages(): Promise<void> {
        await this.session.fillMissingLanguages();
        const saved = this.session
            .rows()
            .find((r) => r.id === this.draft()?.id);
        if (saved) this.select(saved);
    }
    select(row: ClassifiedStream): void {
        this.draft.set({ ...row });
    }
    change(
        field: 'name' | 'country' | 'state' | 'category' | 'language',
        value: string
    ): void {
        this.draft.update((row) =>
            row
                ? {
                      ...row,
                      [field]: value,
                      ...(field === 'country' && value !== 'US'
                          ? { state: undefined }
                          : {}),
                  }
                : null
        );
    }
    filter(unknown: boolean): void {
        this.unknownOnly.set(unknown);
        this.page.set(0);
    }
    async save(): Promise<void> {
        const row = this.draft();
        if (!row || !row.name.trim()) return;
        await this.session.edit({ ...row, name: row.name.trim() });
        const saved = this.session.rows().find((r) => r.id === row.id);
        if (saved) this.select(saved);
    }
}
