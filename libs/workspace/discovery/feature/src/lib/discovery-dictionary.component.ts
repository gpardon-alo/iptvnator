import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { DiscoveryClassificationsComponent } from './discovery-classifications.component';
import { DiscoverySourceSession } from './discovery-source-session';

@Component({
    selector: 'app-discovery-dictionary',
    imports: [
        FormsModule,
        RouterLink,
        TranslateModule,
        DiscoveryClassificationsComponent,
    ],
    providers: [DiscoverySourceSession],
    templateUrl: './discovery-dictionary.component.html',
    styleUrl: './discovery-dictionary.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscoveryDictionaryComponent {
    readonly session = inject(DiscoverySourceSession);
    readonly selectedSources = computed(() =>
        this.session
            .sources()
            .filter((source) => source._id === this.session.sourceId())
    );

    constructor() {
        effect(() => {
            if (this.session.sourceId() && !this.selectedSources().length)
                this.session.select('');
        });
    }
}
