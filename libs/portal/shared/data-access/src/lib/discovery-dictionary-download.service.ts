import { HttpClient, HttpEventType, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { filter, firstValueFrom, tap, timeout } from 'rxjs';

export class DiscoveryDictionaryDownloadError extends Error {}

@Injectable({ providedIn: 'root' })
export class DiscoveryDictionaryDownload {
    private readonly http = inject(HttpClient);

    async download(value: string): Promise<Blob> {
        let url: URL;
        try {
            url = new URL(value.trim());
            if (
                !['http:', 'https:'].includes(url.protocol) ||
                url.username ||
                url.password
            )
                throw new Error();
        } catch {
            throw new DiscoveryDictionaryDownloadError(
                'Enter a full HTTP or HTTPS URL without a username or password.'
            );
        }
        const limit = 32 * 1024 * 1024;
        try {
            const response = await firstValueFrom(
                this.http
                    .get(url.href, {
                        observe: 'events',
                        responseType: 'blob',
                        reportProgress: true,
                        withCredentials: false,
                    })
                    .pipe(
                        timeout(30_000),
                        tap((event) => {
                            if (
                                event.type === HttpEventType.DownloadProgress &&
                                (event.loaded > limit ||
                                    (event.total ?? 0) > limit)
                            )
                                throw new DiscoveryDictionaryDownloadError(
                                    'The dictionary exceeds the 32 MiB limit.'
                                );
                        }),
                        filter(
                            (event): event is HttpResponse<Blob> =>
                                event.type === HttpEventType.Response
                        )
                    )
            );
            if (!response.body || response.body.size > limit)
                throw new DiscoveryDictionaryDownloadError(
                    response.body
                        ? 'The dictionary exceeds the 32 MiB limit.'
                        : 'The dictionary download is empty.'
                );
            return response.body;
        } catch (error) {
            if (error instanceof DiscoveryDictionaryDownloadError) throw error;
            throw new DiscoveryDictionaryDownloadError(
                'Could not download the dictionary. Check the URL and that the server allows access from this app, or import a downloaded file.'
            );
        }
    }
}
