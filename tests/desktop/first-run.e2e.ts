import { browser, expect, $ } from '@wdio/globals';
import '@wdio/tauri-service';

const fixtureUrl = 'http://127.0.0.1:18991/playlist.m3u';

describe('packaged desktop first run', () => {
  after(async () => {
    const sourceIds = await browser.execute(() => {
      try {
        const profiles = JSON.parse(
          localStorage.getItem('movena-source-profiles-v1') ?? '[]',
        ) as Array<{ id?: unknown }>;
        return profiles.flatMap((profile) => (typeof profile.id === 'string' ? [profile.id] : []));
      } catch {
        return [];
      }
    });
    await browser.tauri.execute(
      ({ core }, ids: string[]) => core.invoke('app_data_clear', { sourceIds: ids }),
      sourceIds,
    );
    await browser.execute(() => localStorage.clear());
  });

  it('crosses the real React/Tauri boundary and completes onboarding', async () => {
    const cleared = await browser.tauri.execute(({ core }) =>
      core.invoke('app_data_clear', { sourceIds: [] }),
    );
    expect(cleared).toBeNull();

    await browser.execute(() => localStorage.clear());
    await browser.refresh();

    await (await $('button*=M3U playlist')).click();
    await (await $('input[type="url"]')).setValue(fixtureUrl);
    await (await $('button=Save Source')).click();

    await expect(await $('h2=Where should we start?')).toBeDisplayed();
    await (await $('button*=Everything')).click();
    await (await $('button*=Start watching')).click();

    await expect(await $('nav')).toBeDisplayed();
    await expect(await $('*=Live TV')).toBeDisplayed();
  });
});
