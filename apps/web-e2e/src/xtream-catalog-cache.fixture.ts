import type { Page } from '@playwright/test';

/** Use the source action so catalog refresh preserves favorites and recent items. */
export async function refreshXtreamCatalog(
    page: Page,
    title: string
): Promise<void> {
    await page.locator('[data-test-id="playlist-switcher-trigger"]').click();
    const source = page
        .locator('app-playlist-switcher-panel [role="option"]')
        .filter({ hasText: title });
    await source.locator('.source-row__more').click();
    await Promise.all([
        page.waitForEvent('load'),
        page.getByRole('menuitem', { name: /Refresh/i }).click(),
    ]);
}
