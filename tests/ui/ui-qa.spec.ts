import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { UI_QA_SURFACES } from './surfaces';
import { PRODUCTION_UI_QA_SCENARIOS } from './scenarios';
import { UI_LANGUAGES } from '@/shared/i18n/config';

const MINIMUM_POINTER_TARGET = 24;
const REPRESENTATIVE_SCREENSHOTS = new Set(['primitives', 'settings-controls', 'developer-hud']);
const VISUAL_COMPARISON = process.env.UI_QA_VISUAL === '1';
const THEMES = ['dark', 'light'] as const;
const UI_QA_FIXED_TIME = new Date('2026-08-28T21:53:00.000Z');

function withHarnessOptions(route: string, locale: string, theme: string) {
  return `${route}${route.includes('?') ? '&' : '?'}locale=${locale}&theme=${theme}`;
}

async function readHorizontalOverflow(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
}

async function readUndersizedTargets(page: import('@playwright/test').Page) {
  return page
    .locator('button, a, input, [role="button"], [role="menuitem"], [role="tab"]')
    .evaluateAll(
      (elements, minimum) =>
        elements
          .filter((element) => {
            const node = element as HTMLElement;
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return (
              style.visibility !== 'hidden' &&
              style.display !== 'none' &&
              rect.width > 0 &&
              rect.height > 0 &&
              !node.matches(':disabled') &&
              (rect.width < minimum || rect.height < minimum)
            );
          })
          .map((element) => {
            const node = element as HTMLElement;
            const rect = node.getBoundingClientRect();
            return `${node.tagName.toLowerCase()}[${node.getAttribute('aria-label') ?? node.textContent?.trim() ?? ''}] ${Math.round(rect.width)}x${Math.round(rect.height)}`;
          }),
      MINIMUM_POINTER_TARGET,
    );
}

async function readClippedDialogs(page: import('@playwright/test').Page) {
  return page.locator('[role="dialog"], [role="alertdialog"]').evaluateAll((dialogs) =>
    dialogs
      .filter((dialog) => {
        const rect = dialog.getBoundingClientRect();
        return (
          rect.top < 0 ||
          rect.left < 0 ||
          rect.right > window.innerWidth ||
          rect.bottom > window.innerHeight
        );
      })
      .map((dialog) => {
        const rect = dialog.getBoundingClientRect();
        return `${dialog.getAttribute('aria-label') ?? dialog.getAttribute('aria-labelledby') ?? dialog.tagName} @ ${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
      }),
  );
}

for (const theme of THEMES) {
  for (const surface of UI_QA_SURFACES) {
    test(`${surface} (${theme}) has no accessibility or geometry violations`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));

      await page.setViewportSize({ width: 960, height: 600 });
      await page.goto(`/${surface}?locale=en&theme=${theme}`);
      await expect(page.locator('[data-ui-qa-surface]')).toHaveAttribute(
        'data-ui-qa-surface',
        surface,
      );
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.waitForTimeout(350);

      const overflow = await readHorizontalOverflow(page);
      expect(overflow.document, 'document horizontal overflow').toBeLessThanOrEqual(1);
      expect(overflow.body, 'body horizontal overflow').toBeLessThanOrEqual(1);

      const undersizedTargets = await readUndersizedTargets(page);
      expect(undersizedTargets, 'pointer targets smaller than 24×24 CSS pixels').toEqual([]);

      const accessibility = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(accessibility.violations).toEqual([]);
      expect(errors).toEqual([]);

      if (theme === 'light' || REPRESENTATIVE_SCREENSHOTS.has(surface)) {
        await page.locator('[data-ui-qa-surface]').evaluate((element) => element.scrollTo(0, 0));
        await page.evaluate(() => window.scrollTo(0, 0));
        await testInfo.attach(`${surface}-${theme}.png`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
        if (VISUAL_COMPARISON) {
          const snapshotName =
            theme === 'dark'
              ? `${surface}-${process.platform}.png`
              : `${surface}-light-${process.platform}.png`;
          await expect(page).toHaveScreenshot(snapshotName, { fullPage: true });
        }
      }
    });
  }
}

for (const scenario of PRODUCTION_UI_QA_SCENARIOS) {
  for (const theme of scenario.themes) {
    test(`${scenario.id} (${theme}) satisfies production geometry and accessibility contracts`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      let capturedDefaultScreenshot = false;
      await page.clock.setFixedTime(UI_QA_FIXED_TIME);

      for (const viewport of [
        { width: 1280, height: 800 },
        { width: 960, height: 600 },
        { width: 1280, height: 800 },
        { width: 1440, height: 900 },
        { width: 1920, height: 1080 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(withHarnessOptions(scenario.route, 'en', theme));
        await expect(page.locator('[data-ui-qa-scenario]')).toHaveAttribute(
          'data-ui-qa-scenario',
          scenario.id,
        );
        await page.waitForTimeout(200);

        const overflow = await readHorizontalOverflow(page);
        expect(
          overflow.document,
          `${viewport.width}×${viewport.height} document horizontal overflow`,
        ).toBeLessThanOrEqual(1);
        expect(
          overflow.body,
          `${viewport.width}×${viewport.height} body horizontal overflow`,
        ).toBeLessThanOrEqual(1);
        expect(
          await readUndersizedTargets(page),
          `${viewport.width}×${viewport.height} targets smaller than 24×24`,
        ).toEqual([]);
        expect(
          await readClippedDialogs(page),
          `${viewport.width}×${viewport.height} clipped dialogs`,
        ).toEqual([]);

        for (const layer of scenario.expectedLayers) {
          await expect(
            page.locator(`[data-ui-layer="${layer}"]`).first(),
            `${scenario.id} exposes ${layer} layer marker`,
          ).toBeVisible();
        }

        if (viewport.width === 960) {
          const accessibility = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
            .analyze();
          expect(accessibility.violations).toEqual([]);
        }

        if (
          VISUAL_COMPARISON &&
          scenario.stableScreenshot === 'baseline' &&
          viewport.width === 1280 &&
          viewport.height === 800 &&
          !capturedDefaultScreenshot
        ) {
          await page.evaluate(() => window.scrollTo(0, 0));
          capturedDefaultScreenshot = true;
          const snapshotName = `${scenario.id}-${theme}-default-${process.platform}.png`;
          const screenshot = await page.screenshot({ fullPage: true });
          await testInfo.attach(snapshotName, { body: screenshot, contentType: 'image/png' });
          await expect(page).toHaveScreenshot(snapshotName, { fullPage: true });
        }
      }

      expect(errors).toEqual([]);
    });
  }
}

for (const locale of UI_LANGUAGES) {
  test(`critical production geometry remains stable in ${locale}`, async ({ page }) => {
    await page.clock.setFixedTime(UI_QA_FIXED_TIME);
    const criticalScenarios = PRODUCTION_UI_QA_SCENARIOS.filter((scenario) =>
      [
        'hero',
        'live-epg',
        'series-details',
        'm3u-editor',
        'settings-general',
        'player-series',
      ].includes(scenario.id),
    );

    for (const scenario of criticalScenarios) {
      await page.setViewportSize({ width: 960, height: 600 });
      await page.goto(
        withHarnessOptions(
          scenario.route,
          locale,
          scenario.fixtureSetup === 'native-player' ? 'dark' : 'light',
        ),
      );
      await expect(page.locator('[data-ui-qa-scenario]')).toHaveAttribute(
        'data-ui-qa-scenario',
        scenario.id,
      );
      const overflow = await readHorizontalOverflow(page);
      expect(
        overflow.document,
        `${scenario.id} ${locale} minimum-width overflow`,
      ).toBeLessThanOrEqual(1);
      expect(await readClippedDialogs(page), `${scenario.id} ${locale} clipped dialogs`).toEqual(
        [],
      );
    }
  });
}

test('live catalog header controls never overlap through intermediate workspace widths', async ({
  page,
}, testInfo) => {
  await page.clock.setFixedTime(UI_QA_FIXED_TIME);

  for (const viewport of [
    { width: 1124, height: 650, name: 'mid' },
    { width: 960, height: 600, name: 'minimum' },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(withHarnessOptions('/?readme=live-tv', 'en', 'dark'));
    await expect(page.locator('[data-ui-qa-scenario]')).toHaveAttribute(
      'data-ui-qa-scenario',
      'live-tv',
    );

    const controls = {
      title: page.getByRole('heading', { level: 1, name: 'Live TV' }),
      search: page.getByRole('combobox', { name: 'Search your library' }),
      sort: page.getByRole('button', { name: 'Sort catalog items' }),
      view: page.getByRole('radiogroup', { name: 'Catalog layout' }),
    };
    await expect(controls.title).toBeVisible();
    await expect(controls.search).toBeVisible();
    await expect(controls.sort).toBeVisible();
    await expect(controls.view).toBeVisible();

    const boxes = Object.fromEntries(
      await Promise.all(
        Object.entries(controls).map(async ([name, locator]) => {
          const box = await locator.boundingBox();
          expect(box, `${viewport.name} ${name} has measurable geometry`).not.toBeNull();
          return [name, box!];
        }),
      ),
    ) as Record<keyof typeof controls, { x: number; y: number; width: number; height: number }>;

    for (const [name, box] of Object.entries(boxes)) {
      expect(box.x, `${viewport.name}: ${name} starts inside the viewport`).toBeGreaterThanOrEqual(
        0,
      );
      expect(box.y, `${viewport.name}: ${name} starts inside the viewport`).toBeGreaterThanOrEqual(
        0,
      );
      expect(
        box.x + box.width,
        `${viewport.name}: ${name} ends inside the viewport width`,
      ).toBeLessThanOrEqual(viewport.width + 1);
      expect(
        box.y + box.height,
        `${viewport.name}: ${name} ends inside the viewport height`,
      ).toBeLessThanOrEqual(viewport.height + 1);
    }

    const overlaps = (left: typeof boxes.title, right: typeof boxes.title) =>
      !(
        left.x + left.width <= right.x ||
        right.x + right.width <= left.x ||
        left.y + left.height <= right.y ||
        right.y + right.height <= left.y
      );

    for (const [left, right] of [
      ['title', 'search'],
      ['title', 'sort'],
      ['title', 'view'],
      ['search', 'sort'],
      ['search', 'view'],
      ['sort', 'view'],
    ] as const) {
      expect(
        overlaps(boxes[left], boxes[right]),
        `${viewport.name}: ${left} must not overlap ${right}`,
      ).toBe(false);
    }

    const overflow = await readHorizontalOverflow(page);
    expect(overflow.document, `${viewport.name} document horizontal overflow`).toBeLessThanOrEqual(
      1,
    );
    expect(overflow.body, `${viewport.name} body horizontal overflow`).toBeLessThanOrEqual(1);

    if (VISUAL_COMPARISON) {
      await expect(page).toHaveScreenshot(
        `live-tv-header-${viewport.name}-${process.platform}.png`,
        { fullPage: true },
      );
    } else {
      await testInfo.attach(`live-tv-header-${viewport.name}.png`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
    }
  }
});

test('the 960×600 logical minimum remains unchanged at 200% device scale', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 960, height: 600 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(UI_QA_FIXED_TIME);

  try {
    for (const scenarioId of [
      'live-tv',
      'live-epg',
      'series-details',
      'm3u-editor',
      'settings-general',
      'player-series',
    ]) {
      const scenario = PRODUCTION_UI_QA_SCENARIOS.find((candidate) => candidate.id === scenarioId);
      expect(scenario, `${scenarioId} is registered`).toBeTruthy();
      await page.goto(
        withHarnessOptions(
          scenario!.route,
          'en',
          scenario!.fixtureSetup === 'native-player' ? 'dark' : 'light',
        ),
      );
      await expect(page.locator('[data-ui-qa-scenario]')).toHaveAttribute(
        'data-ui-qa-scenario',
        scenarioId,
      );

      const metrics = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      }));
      expect(metrics).toEqual({ width: 960, height: 600, devicePixelRatio: 2 });

      const overflow = await readHorizontalOverflow(page);
      expect(overflow.document, `${scenarioId} 200% DPI document overflow`).toBeLessThanOrEqual(1);
      expect(overflow.body, `${scenarioId} 200% DPI body overflow`).toBeLessThanOrEqual(1);
      expect(await readClippedDialogs(page), `${scenarioId} 200% DPI clipped dialogs`).toEqual([]);
    }
  } finally {
    await context.close();
  }
});

test('global layer tokens and modal hit testing preserve the intended order', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto('/?readme=series-details&locale=en&theme=dark');
  const order = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const read = (token: string) => Number(root.getPropertyValue(token).trim());
    return {
      modal: read('--z-modal'),
      dropdown: read('--z-dropdown'),
      toast: read('--z-toast'),
      player: read('--z-player'),
      playerControls: read('--z-player-controls'),
      windowChrome: read('--z-window-chrome'),
      playerPopover: read('--z-player-popover'),
      debug: read('--z-debug'),
      contextMenu: read('--z-context-menu'),
    };
  });
  expect(order.modal).toBeLessThan(order.dropdown);
  expect(order.dropdown).toBeLessThan(order.toast);
  expect(order.toast).toBeLessThan(order.player);
  expect(order.player).toBeLessThan(order.playerControls);
  expect(order.playerControls).toBeLessThan(order.windowChrome);
  expect(order.windowChrome).toBeLessThan(order.playerPopover);
  expect(order.playerPopover).toBeLessThan(order.debug);
  expect(order.debug).toBeLessThan(order.contextMenu);

  const backdropWins = await page.evaluate(() => {
    const element = document.elementFromPoint(2, window.innerHeight - 2) as HTMLElement | null;
    return element?.closest<HTMLElement>('[data-ui-layer]')?.dataset.uiLayer;
  });
  expect(backdropWins).toBe('modal');
});

test('light preference temporarily uses the dark token contract during playback', async ({
  page,
}) => {
  await page.goto('/primitives?locale=en&theme=light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  const beforePlayback = await page.evaluate(() => ({
    background: getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim(),
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
  }));
  expect(beforePlayback).toEqual({ background: '#f3f6fa', colorScheme: 'light' });

  const duringPlayback = await page.evaluate(() => {
    document.documentElement.classList.add('is-playing');
    return {
      background: getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim(),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    };
  });
  expect(duringPlayback).toEqual({ background: '#0b0e14', colorScheme: 'dark' });

  const afterPlayback = await page.evaluate(() => {
    document.documentElement.classList.remove('is-playing');
    return {
      background: getComputedStyle(document.documentElement).getPropertyValue('--bg-base').trim(),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    };
  });
  expect(afterPlayback).toEqual(beforePlayback);
});

test('artwork-backed tags keep the high-contrast media palette in both themes', async ({
  page,
}) => {
  const readTagStyles = async (theme: (typeof THEMES)[number]) => {
    await page.goto(`/content-states?locale=en&theme=${theme}`);
    return page.locator('[data-tag-type]').evaluateAll((elements) =>
      elements.slice(0, 2).map((element) => {
        const style = getComputedStyle(element);
        return {
          type: element.getAttribute('data-tag-type'),
          color: style.color,
          background: style.backgroundColor,
        };
      }),
    );
  };

  const dark = await readTagStyles('dark');
  const light = await readTagStyles('light');

  expect(light).toEqual(dark);
  expect(light.map(({ type }) => type)).toEqual(['gold', 'blue']);
});

for (const theme of THEMES) {
  for (const surface of ['content-states', 'settings-controls'] as const) {
    test(`${surface} (${theme}) remains contained with German copy`, async ({ page }) => {
      await page.setViewportSize({ width: 960, height: 600 });
      await page.goto(`/${surface}?locale=de&theme=${theme}`);
      await expect(page.locator('[data-ui-qa-surface]')).toHaveAttribute(
        'data-ui-qa-surface',
        surface,
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
}
