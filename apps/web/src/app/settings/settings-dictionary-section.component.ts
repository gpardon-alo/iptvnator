import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AsyncPipe, NgComponentOutlet } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { SettingsChannelLogosComponent } from './settings-channel-logos.component';

@Component({
    selector: 'app-settings-dictionary-section',
    imports: [
        TranslateModule,
        AsyncPipe,
        NgComponentOutlet,
        SettingsChannelLogosComponent,
    ],
    templateUrl: './settings-dictionary-section.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsDictionarySectionComponent {
    readonly editor = import('@iptvnator/workspace/discovery/feature').then(
        (module) => module.DiscoveryDictionaryComponent
    );
}
