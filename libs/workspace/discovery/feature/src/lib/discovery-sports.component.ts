import {
    ChangeDetectionStrategy,
    Component,
    input,
    output,
    signal,
} from '@angular/core';
import { DISCOVERY_LEAGUES } from './discovery-leagues';

@Component({
    selector: 'app-discovery-sports',
    standalone: true,
    templateUrl: './discovery-sports.component.html',
    styleUrl: './discovery-sports.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscoverySportsComponent {
    readonly selected = input('');
    readonly leagueToggle = output<string>();
    readonly leagues = DISCOVERY_LEAGUES;
    readonly darkLogos: readonly string[] = [
        'champions-league',
        'liga-portugal',
        'liga-1-peru',
    ];
    readonly failedLogos = signal<string[]>([]);
    logoFailed(id: string): void {
        this.failedLogos.update((ids) => [...ids, id]);
    }
}
