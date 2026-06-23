/**
 * M6.3 gesture smoke tests.
 *
 * Prerequisites (see README.md):
 *   1. pnpm --filter @notes-app/mobile build
 *   2. cd apps/mobile && npx cap sync android
 *   3. cd apps/mobile/android && ./gradlew assembleDebug installDebug
 *   4. Pixel_9 emulator (or real device) connected/running
 *   5. appium driver install uiautomator2   (once)
 *
 * Run: pnpm test  (from apps/mobile/e2e-mobile/)
 */

import { expect } from 'expect';

// ─── helpers ──────────────────────────────────────────────────────────────────

const APP_PACKAGE = 'app.notes.mobile';
const WEBVIEW_CONTEXT = `WEBVIEW_${APP_PACKAGE}`;

/** Wait for the WebView context to appear and switch into it. */
async function switchToWebView(driver: WebdriverIO.Browser): Promise<void> {
  await driver.waitUntil(
    async () => {
      const ctxs = await driver.getContexts();
      return ctxs.some((c) => String(c).startsWith('WEBVIEW'));
    },
    { timeout: 15000, timeoutMsg: 'WebView context never appeared' },
  );
  await driver.switchContext(WEBVIEW_CONTEXT);
}

/** Check whether the VaultOpenScreen is shown (vault not yet opened). */
async function isOnVaultOpenScreen(driver: WebdriverIO.Browser): Promise<boolean> {
  try {
    const btn = await driver.$('button[aria-label="Open vault folder"], button*=Open vault folder');
    return await btn.isDisplayed();
  } catch {
    return false;
  }
}

/**
 * Drive the SAF folder picker in NATIVE_APP context.
 * Selects the first available folder in the picker (usually Documents).
 * Uses resource IDs where possible — more stable across Android versions.
 */
async function pickFirstFolder(driver: WebdriverIO.Browser): Promise<void> {
  // Tap "Open vault folder" button in WebView
  await switchToWebView(driver);
  const openBtn = await driver.$('button=Open vault folder');
  await openBtn.click();

  // Native picker opens — switch to NATIVE_APP
  await driver.switchContext('NATIVE_APP');

  // Wait for the document picker activity
  await driver.waitUntil(
    async () => {
      try {
        const title = await driver.$('android=new UiSelector().resourceId("com.android.documentsui:id/toolbar")');
        return await title.isDisplayed();
      } catch {
        return false;
      }
    },
    { timeout: 10000, timeoutMsg: 'SAF picker never appeared' },
  );

  // Navigate to a folder — tap the first item in the list
  try {
    const item = await driver.$('android=new UiSelector().className("android.widget.LinearLayout").instance(0)');
    await item.click();
  } catch {
    // Fallback: tap by text "Documents"
    const docs = await driver.$('android=new UiSelector().text("Documents")');
    await docs.click();
  }

  // Tap "USE THIS FOLDER" button (resource ID stable across versions)
  const useFolder = await driver.$('android=new UiSelector().resourceId("android:id/button1")');
  await useFolder.click();

  // Allow permission dialog
  try {
    const allow = await driver.$('android=new UiSelector().resourceId("android:id/button1")');
    if (await allow.isDisplayed()) await allow.click();
  } catch {
    // Permission dialog may not appear if already granted (noReset: true)
  }

  // Return to WebView
  await switchToWebView(driver);

  // Wait for the app to finish loading the vault
  await driver.waitUntil(
    async () => {
      try {
        const sidebar = await driver.$('aside[aria-label="Sidebar"]');
        return await sidebar.isDisplayed();
      } catch {
        return false;
      }
    },
    { timeout: 15000, timeoutMsg: 'Vault never loaded after folder pick' },
  );
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('M6.3 — Mobile gestures', function () {
  this.timeout(120_000);

  before(async function () {
    // If no vault is open yet (first run), drive the SAF picker.
    if (await isOnVaultOpenScreen(driver)) {
      await pickFirstFolder(driver);
    } else {
      await switchToWebView(driver);
      // Make sure we are in AppShell (vault loaded)
      await driver.waitUntil(
        async () => {
          try {
            const sidebar = await driver.$('aside[aria-label="Sidebar"]');
            return await sidebar.isDisplayed();
          } catch {
            return false;
          }
        },
        { timeout: 10000, timeoutMsg: 'AppShell never appeared' },
      );
    }
  });

  // ── M6.3.1 — Responsive drawer ────────────────────────────────────────────

  it('shows the hamburger toggle button on mobile (<768px viewport)', async function () {
    const toggle = await driver.$('[data-testid="sidebar-toggle"]');
    expect(await toggle.isDisplayed()).toBe(true);
  });

  it('sidebar is initially closed on mobile', async function () {
    const sidebar = await driver.$('aside[aria-label="Sidebar"]');
    // On mobile the sidebar is off-screen (-translate-x-full) — not visible
    const location = await sidebar.getLocation();
    // x should be negative (translated off-screen) or element not interactable
    expect(location.x).toBeLessThan(0);
  });

  // ── M6.3.2 — Edge-swipe / hamburger open + auto-close ────────────────────

  it('opens the drawer via the hamburger button', async function () {
    const toggle = await driver.$('[data-testid="sidebar-toggle"]');
    await toggle.click();

    const sidebar = await driver.$('aside[aria-label="Sidebar"]');
    await driver.waitUntil(
      async () => {
        const location = await sidebar.getLocation();
        return location.x >= 0;
      },
      { timeout: 2000, timeoutMsg: 'Sidebar never slid into view' },
    );
  });

  it('closes the drawer when tapping a note in the sidebar', async function () {
    // Make sure drawer is open
    const sidebar = await driver.$('aside[aria-label="Sidebar"]');
    const loc = await sidebar.getLocation();
    if (loc.x < 0) {
      const toggle = await driver.$('[data-testid="sidebar-toggle"]');
      await toggle.click();
      await driver.pause(300);
    }

    // Tap the first note row in the file tree
    const noteBtn = await driver.$('aside button:not([aria-label])');
    if (await noteBtn.isDisplayed()) {
      await noteBtn.click();
      // Drawer should auto-close
      await driver.waitUntil(
        async () => {
          const location = await sidebar.getLocation();
          return location.x < 0;
        },
        { timeout: 2000, timeoutMsg: 'Drawer did not close after note selection' },
      );
    } else {
      // Empty vault — skip this assertion
      this.skip();
    }
  });

  it('opens the drawer via edge swipe right', async function () {
    // Ensure drawer is closed first
    const sidebar = await driver.$('aside[aria-label="Sidebar"]');
    const loc = await sidebar.getLocation();
    if (loc.x >= 0) {
      // Close it via the close button
      const closeBtn = await driver.$('aside button[aria-label="Close sidebar"]');
      await closeBtn.click();
      await driver.pause(300);
    }

    // Swipe right from left edge — use native context for reliable screen coords
    await driver.switchContext('NATIVE_APP');
    const { width, height } = await driver.getWindowSize();
    await driver.execute('mobile: swipeGesture', {
      left: 0,
      top: Math.floor(height * 0.5),
      width: 40,
      height: 10,
      direction: 'right',
      percent: 0.9,
    });
    await driver.switchContext(WEBVIEW_CONTEXT);

    await driver.waitUntil(
      async () => {
        const location = await sidebar.getLocation();
        return location.x >= 0;
      },
      { timeout: 2000, timeoutMsg: 'Drawer did not open via edge swipe' },
    );
  });

  // ── M6.3.3 — Long-press wikilink peek ─────────────────────────────────────

  it('shows peek panel on long-press of a wikilink', async function () {
    // Need a note with a wikilink open in the editor.
    // Try to open a note and check for wikilinks — skip if vault is empty.
    const noteBtn = await driver.$('aside button:not([aria-label])');
    if (!(await noteBtn.isDisplayed())) {
      this.skip();
      return;
    }

    // Open drawer, select first note
    const toggle = await driver.$('[data-testid="sidebar-toggle"]');
    await toggle.click();
    await driver.pause(200);
    await noteBtn.click();
    await driver.pause(500);

    // Look for a wikilink in the editor
    const wikilink = await driver.$('span.wikilink');
    if (!(await wikilink.isDisplayed())) {
      this.skip();
      return;
    }

    // Capture active note before the gesture
    const activeBefore = await driver.$('aside button.bg-accent\\/20');
    const titleBefore = await activeBefore.getText().catch(() => '');

    // Long-press the wikilink
    await driver.execute('mobile: longClickGesture', {
      elementId: wikilink.elementId,
      duration: 600,
    });

    // Peek panel should appear
    const peek = await driver.$('[data-testid="wikilink-peek"]');
    await driver.waitUntil(() => peek.isDisplayed(), {
      timeout: 3000,
      timeoutMsg: 'Wikilink peek never appeared after long-press',
    });

    // Active note must not have changed (no navigation)
    const activeAfter = await driver.$('aside button.bg-accent\\/20');
    const titleAfter = await activeAfter.getText().catch(() => '');
    expect(titleAfter).toBe(titleBefore);
  });

  // ── M6.3.4 — Pinch-zoom graph ─────────────────────────────────────────────

  it('graph view survives a pinch-zoom gesture', async function () {
    // Open graph view via the search palette or keyboard shortcut
    // Using a direct DOM evaluation since mobile has no keyboard
    await driver.execute(() => {
      // Dispatch Ctrl+G equivalent — Cytoscape listens on the container
      const event = new KeyboardEvent('keydown', {
        key: 'g',
        ctrlKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);
    });
    await driver.pause(800);

    const graphContainer = await driver.$('canvas');
    if (!(await graphContainer.isDisplayed())) {
      this.skip();
      return;
    }

    // Pinch open gesture on the graph canvas
    await driver.execute('mobile: pinchOpenGesture', {
      elementId: graphContainer.elementId,
      percent: 0.5,
      speed: 2500,
    });
    await driver.pause(500);

    // No crash = pass. Graph canvas still present.
    expect(await graphContainer.isDisplayed()).toBe(true);

    // Close graph view
    await driver.execute(() => {
      const event = new KeyboardEvent('keydown', {
        key: 'g',
        ctrlKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);
    });
  });
});
