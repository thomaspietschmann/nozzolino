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
async function switchToWebView(d: WebdriverIO.Browser): Promise<void> {
  // If a native overlay (e.g. a leftover SAF picker) is covering the app, the WebView
  // context disappears. Press Back once to dismiss any lingering native activity, then wait.
  try {
    const ctxs = await d.getContexts();
    if (!ctxs.some((c) => String(c).startsWith('WEBVIEW'))) {
      await d.switchContext('NATIVE_APP');
      await d.pressKeyCode(4); // KEYCODE_BACK
      await d.pause(1500);
    }
  } catch { /* ignore — just proceed to the waitUntil below */ }

  await d.waitUntil(
    async () => {
      const ctxs = await d.getContexts();
      return ctxs.some((c) => String(c).startsWith('WEBVIEW'));
    },
    { timeout: 20000, timeoutMsg: 'WebView context never appeared' },
  );
  await d.switchContext(WEBVIEW_CONTEXT);
}

/** Check whether the VaultOpenScreen is shown (vault not yet opened). */
async function isOnVaultOpenScreen(d: WebdriverIO.Browser): Promise<boolean> {
  try {
    const btn = await d.$('[data-testid="open-vault-btn"]');
    return await btn.isDisplayed();
  } catch {
    return false;
  }
}

/**
 * Drive the SAF folder picker in NATIVE_APP context.
 * Uses resource IDs — more stable across Android versions than text.
 */
async function pickFirstFolder(d: WebdriverIO.Browser): Promise<void> {
  // Already in WebView context — tap "Open vault folder"
  const openBtn = await d.$('[data-testid="open-vault-btn"]');
  await openBtn.click();

  // Give the SAF intent time to fire and the DocumentsUI activity to start.
  // Without this pause, Appium starts polling before the Activity is visible.
  await d.pause(3000);

  // Switch to native context now that the picker should be launching
  await d.switchContext('NATIVE_APP');

  // Wait for the document picker — try both the AOSP and Google-flavoured DocumentsUI package names.
  // On Pixel/Google emulators the package is "com.google.android.documentsui".
  await d.waitUntil(
    async () => {
      const selectors = [
        'android=new UiSelector().resourceId("com.google.android.documentsui:id/toolbar")',
        'android=new UiSelector().resourceId("com.android.documentsui:id/toolbar")',
        'android=new UiSelector().resourceId("com.google.android.documentsui:id/dir_list")',
      ];
      for (const sel of selectors) {
        try {
          const el = await d.$(sel);
          if (await el.isDisplayed()) return true;
        } catch { /* not found yet */ }
      }
      return false;
    },
    { timeout: 20000, timeoutMsg: 'SAF picker never appeared' },
  );

  // Create a new vault folder ("NotesVault") to avoid Android's "Can't use this folder"
  // restriction that applies to built-in directories (Documents, Downloads, etc.) on Android 14+.
  try {
    // If a "CREATE NEW FOLDER" button is present, use it (we are at the root level)
    const createDirBtn = await d.$(
      'android=new UiSelector().resourceId("com.google.android.documentsui:id/action_button")',
    );
    if (await createDirBtn.isDisplayed()) {
      await createDirBtn.click();
      await d.pause(800);
      // Type the folder name and confirm
      const nameInput = await d.$('android=new UiSelector().className("android.widget.EditText")');
      await nameInput.clearValue();
      await nameInput.setValue('NotesVault');
      await d.pause(400);
      const okBtn = await d.$('android=new UiSelector().resourceId("android:id/button1")');
      await okBtn.click();
      await d.pause(1000);
    }
  } catch { /* already inside a folder that can be used — proceed */ }

  // "USE THIS FOLDER" — resource-id is the most stable selector
  await d.waitUntil(
    async () => {
      try {
        const btn = await d.$('android=new UiSelector().resourceId("android:id/button1")');
        return await btn.isDisplayed();
      } catch {
        return false;
      }
    },
    { timeout: 10000, timeoutMsg: '"Use this folder" button never appeared' },
  );
  const useFolder = await d.$('android=new UiSelector().resourceId("android:id/button1")');
  await useFolder.click();
  await d.pause(800);

  // Allow-access dialog (android:id/button1 = ALLOW)
  try {
    await d.waitUntil(
      async () => {
        try {
          const allow = await d.$('android=new UiSelector().resourceId("android:id/button1")');
          return await allow.isDisplayed();
        } catch { return false; }
      },
      { timeout: 5000, timeoutMsg: '' },
    );
    const allow = await d.$('android=new UiSelector().resourceId("android:id/button1")');
    await allow.click();
    await d.pause(500);
  } catch { /* already granted or dialog did not appear */ }

  // Back to WebView — vault should load
  await switchToWebView(d);
  await d.waitUntil(
    async () => {
      try {
        const sidebar = await d.$('aside[aria-label="Sidebar"]');
        return await sidebar.isDisplayed();
      } catch {
        return false;
      }
    },
    { timeout: 20000, timeoutMsg: 'Vault never loaded after folder pick' },
  );
}

/** Return true when the sidebar is in the open state (data-open="true"). */
async function isSidebarOpen(d: WebdriverIO.Browser): Promise<boolean> {
  const sidebar = await d.$('aside[aria-label="Sidebar"]');
  const attr = await sidebar.getAttribute('data-open');
  return attr === 'true';
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('M6.3 — Mobile gestures', function () {
  this.timeout(120_000);

  before(async function () {
    // Switch into WebView first
    await switchToWebView(driver);

    // Wait for EITHER the VaultOpenScreen OR the AppShell to appear (whichever comes first).
    // The app may be loading the saved vault URI, so neither is guaranteed to be immediate.
    await driver.waitUntil(
      async () => {
        try {
          const sidebar = await driver.$('aside[aria-label="Sidebar"]');
          if (await sidebar.isDisplayed()) return true;
        } catch { /* not there yet */ }
        try {
          const vaultBtn = await driver.$('[data-testid="open-vault-btn"]');
          if (await vaultBtn.isDisplayed()) return true;
        } catch { /* not there yet */ }
        return false;
      },
      { timeout: 25000, timeoutMsg: 'Neither VaultOpenScreen nor AppShell appeared after 25 s' },
    );

    // If no vault is open yet (first run), drive the SAF picker
    if (await isOnVaultOpenScreen(driver)) {
      await pickFirstFolder(driver);
    }
    // Otherwise AppShell is already visible — nothing more to do.

    // Ensure drawer starts closed before the suite runs
    if (await isSidebarOpen(driver)) {
      try {
        const closeBtn = await driver.$('aside button[aria-label="Close sidebar"]');
        if (await closeBtn.isDisplayed()) await closeBtn.click();
      } catch {
        // If close btn not reachable, tap the backdrop
        await driver.execute(() => {
          // Force close by dispatching a click outside the aside
          document.documentElement.click();
        });
      }
      await driver.pause(300);
    }
  });

  // ── M6.3.1 — Responsive drawer ────────────────────────────────────────────

  it('shows the hamburger toggle button on mobile', async function () {
    const toggle = await driver.$('[data-testid="sidebar-toggle"]');
    expect(await toggle.isDisplayed()).toBe(true);
  });

  it('sidebar is initially closed on mobile (data-open=false)', async function () {
    expect(await isSidebarOpen(driver)).toBe(false);
  });

  // ── M6.3.2 — Hamburger open + auto-close ─────────────────────────────────

  it('opens the drawer via the hamburger button', async function () {
    const toggle = await driver.$('[data-testid="sidebar-toggle"]');
    await toggle.click();

    await driver.waitUntil(() => isSidebarOpen(driver), {
      timeout: 2000,
      timeoutMsg: 'Sidebar never opened after hamburger tap',
    });
  });

  it('closes the drawer when tapping a note in the sidebar', async function () {
    // Ensure drawer is open
    if (!(await isSidebarOpen(driver))) {
      const toggle = await driver.$('[data-testid="sidebar-toggle"]');
      await toggle.click();
      await driver.waitUntil(() => isSidebarOpen(driver), { timeout: 2000, timeoutMsg: 'Could not open drawer' });
    }

    // Find the first note row (stable data-testid added in M6.3)
    const noteRows = await driver.$$('[data-testid="note-row"]');
    if (noteRows.length === 0) {
      this.skip();
      return;
    }
    const noteBtn = noteRows[0]!;
    await noteBtn.click();

    // Drawer should auto-close
    await driver.waitUntil(
      async () => !(await isSidebarOpen(driver)),
      { timeout: 2000, timeoutMsg: 'Drawer did not close after note selection' },
    );
  });

  // ── M6.3.3 — Edge-swipe ───────────────────────────────────────────────────

  it('opens the drawer via edge swipe right', async function () {
    // Ensure we're in WebView context
    await switchToWebView(driver);

    // Ensure drawer is closed
    if (await isSidebarOpen(driver)) {
      await driver.execute(() => {
        document.documentElement.click(); // tap outside aside → close via backdrop
      });
      await driver.pause(400);
    }

    // Simulate the edge-swipe gesture via JS TouchEvent dispatch in the WebView context.
    // Reason: using NATIVE_APP + mobile:swipeGesture from x=0 triggers Android's system
    // back gesture on Android 10+, which backgrounds the app and kills the WebView context.
    // Dispatching TouchEvents directly into the React document is reliable and controlled.
    await driver.execute(() => {
      const y = Math.floor(window.innerHeight / 2);
      // Start at x=5 (within the 24 px edge zone required by useEdgeSwipe)
      const t1 = new Touch({ identifier: 1, target: document.documentElement, clientX: 5, clientY: y, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 });
      document.dispatchEvent(new TouchEvent('touchstart', { touches: [t1], changedTouches: [t1], bubbles: true, cancelable: true }));
      // End at x=200 → dx=195, well above the 60 px threshold
      const t2 = new Touch({ identifier: 1, target: document.documentElement, clientX: 200, clientY: y, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 });
      document.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t2], bubbles: true, cancelable: true }));
    });

    await driver.waitUntil(() => isSidebarOpen(driver), {
      timeout: 2000,
      timeoutMsg: 'Drawer did not open via edge swipe',
    });

    // Clean up: close the drawer by tapping the backdrop
    try {
      await driver.execute(() => { document.documentElement.click(); });
    } catch { /* no-op */ }
    await driver.pause(300);
  });

  // ── M6.3.4 — Long-press wikilink peek ─────────────────────────────────────

  it('shows peek panel on long-press of a wikilink', async function () {
    // Ensure WebView context (previous test may have changed it)
    await switchToWebView(driver);

    // Open a note that has wikilinks — skip if vault is empty or has no wikilinks
    const noteRows = await driver.$$('[data-testid="note-row"]');
    if (noteRows.length === 0) {
      this.skip();
      return;
    }

    // Ensure sidebar open, select first note
    if (!(await isSidebarOpen(driver))) {
      const toggle = await driver.$('[data-testid="sidebar-toggle"]');
      await toggle.click();
      await driver.waitUntil(() => isSidebarOpen(driver), { timeout: 2000, timeoutMsg: 'Could not open drawer for note selection' });
    }

    // Iterate through notes until we find one with a wikilink (or give up)
    let wikilink: WebdriverIO.Element | null = null;
    const rows = await driver.$$('[data-testid="note-row"]');
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const row = rows[i]!;
      await row.click();
      await driver.pause(500);

      // Close the drawer if it auto-closed
      await driver.pause(100);

      // Check for wikilink in the editor
      const links = await driver.$$('span.wikilink');
      if (links.length > 0 && (await links[0]!.isDisplayed())) {
        wikilink = links[0]!;
        break;
      }

      // Re-open sidebar to pick another note
      if (i < rows.length - 1) {
        const toggle = await driver.$('[data-testid="sidebar-toggle"]');
        await toggle.click();
        await driver.waitUntil(() => isSidebarOpen(driver), { timeout: 2000, timeoutMsg: 'Could not re-open drawer' });
      }
    }

    if (!wikilink) {
      this.skip();
      return;
    }

    // Record which note is active before the gesture
    const activeLinks = await driver.$$('aside [data-testid="note-row"].bg-accent\\/20, aside [data-testid="note-row"][class*="bg-accent"]');
    const titleBefore = activeLinks.length > 0 ? await activeLinks[0]!.getText().catch(() => '') : '';

    // Long-press via JS TouchEvent dispatch.
    // mobile:longClickGesture uses Android's accessibility long-click which bypasses the
    // React touchstart/touchend handler. Dispatching TouchEvents directly is reliable.
    //
    // CRITICAL: dispatch ON the wikilink element (not document) so that when the event
    // bubbles up, e.target === wl and `(e.target).closest('.wikilink')` returns the element.
    // If dispatched on document, e.target === document which has no .closest() → returns early.
    //
    // Step 1: touchstart (starts the 450ms timer in WikilinkPeek)
    await driver.execute(() => {
      const wl = document.querySelector('span.wikilink');
      if (!wl) return;
      const rect = wl.getBoundingClientRect();
      const cx = Math.round(rect.left + rect.width / 2);
      const cy = Math.round(rect.top + rect.height / 2);
      const t = new Touch({ identifier: 99, target: wl, clientX: cx, clientY: cy, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 });
      // Dispatch on wl so e.target is the wikilink element when the handler on document fires
      wl.dispatchEvent(new TouchEvent('touchstart', { touches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
    });
    // Step 2: wait 600ms — the 450ms timer fires and the peek panel appears
    await driver.pause(600);
    // Step 3: touchend — longPressFired is true so any synthetic click is swallowed
    await driver.execute(() => {
      const wl = document.querySelector('span.wikilink');
      if (!wl) return;
      const rect = wl.getBoundingClientRect();
      const cx = Math.round(rect.left + rect.width / 2);
      const cy = Math.round(rect.top + rect.height / 2);
      const t = new Touch({ identifier: 99, target: wl, clientX: cx, clientY: cy, radiusX: 1, radiusY: 1, rotationAngle: 0, force: 1 });
      wl.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t], bubbles: true, cancelable: true }));
    });

    // Peek panel should appear
    const peek = await driver.$('[data-testid="wikilink-peek"]');
    await driver.waitUntil(() => peek.isDisplayed(), {
      timeout: 3000,
      timeoutMsg: 'Wikilink peek never appeared after long-press',
    });

    // Active note must not have changed (no navigation triggered)
    const activeLinksAfter = await driver.$$('aside [data-testid="note-row"].bg-accent\\/20, aside [data-testid="note-row"][class*="bg-accent"]');
    const titleAfter = activeLinksAfter.length > 0 ? await activeLinksAfter[0]!.getText().catch(() => '') : '';
    expect(titleAfter).toBe(titleBefore);
  });

  // ── Bug regression — no duplicate notes on create / edit ─────────────────

  /** Count note-row elements via JS (works regardless of sidebar state). */
  async function countNoteRows(d: WebdriverIO.Browser): Promise<number> {
    const count = await d.execute(() =>
      document.querySelectorAll('[data-testid="note-row"]').length,
    );
    return Number(count);
  }

  /** Close the sidebar if open, then wait until it is definitely closed. */
  async function ensureSidebarClosed(d: WebdriverIO.Browser): Promise<void> {
    if (!(await isSidebarOpen(d))) return;
    try {
      const closeBtn = await d.$('aside button[aria-label="Close sidebar"]');
      if (await closeBtn.isDisplayed()) {
        await closeBtn.click();
      } else {
        throw new Error('close btn not visible');
      }
    } catch {
      await d.execute(() => { document.documentElement.click(); });
    }
    await d.waitUntil(async () => !(await isSidebarOpen(d)), {
      timeout: 2000,
      timeoutMsg: 'Sidebar did not close',
    });
  }

  it('creating a note produces exactly one list entry', async function () {
    await switchToWebView(driver);

    // Open the drawer so the "New note" button is accessible
    if (!(await isSidebarOpen(driver))) {
      const toggle = await driver.$('[data-testid="sidebar-toggle"]');
      await toggle.click();
      await driver.waitUntil(() => isSidebarOpen(driver), { timeout: 2000, timeoutMsg: 'Could not open drawer' });
    }

    // Count via JS — works even if rows aren't in the DOM viewport
    const beforeRows = await countNoteRows(driver);

    // Tap "New note" — this OPENS a title-entry form (not a direct create action).
    // Sidebar.tsx: setShowNewNote(true) → shows <form><input placeholder="Note title…" /></form>
    const newNoteBtn = await driver.$('button[title="New note"]');
    if (!(await newNoteBtn.isDisplayed())) {
      this.skip();
      return;
    }
    await newNoteBtn.click();

    // Wait for the title input to appear (autoFocus — may need a moment on SAF devices)
    await driver.waitUntil(
      async () => {
        try {
          const inp = await driver.$('input[placeholder="Note title…"]');
          return await inp.isDisplayed();
        } catch {
          return false;
        }
      },
      { timeout: 3000, timeoutMsg: 'Title input form never appeared after clicking New note' },
    );

    // Type a title and submit via Enter — triggers handleCreate in Sidebar.tsx.
    // Use a unique title: the emulator runs with noReset:true, so a fixed name
    // would already exist on a re-run and createNote would (correctly) dedupe,
    // making this "exactly +1" assertion fail for a non-bug reason.
    const titleInput = await driver.$('input[placeholder="Note title…"]');
    await titleInput.setValue(`Regression Test Note ${Date.now()}`);
    await driver.keys(['Enter']); // form submit

    // Brief pause to let the SAF write complete before polling
    await driver.pause(800);

    // Wait until the list grows by exactly 1 (up to 10 s — SAF I/O can be slow)
    await driver.waitUntil(
      async () => (await countNoteRows(driver)) === beforeRows + 1,
      { timeout: 10000, timeoutMsg: `Row count never reached ${beforeRows + 1}` },
    );

    // Extra check: count should not grow further (no duplicate arriving late)
    await driver.pause(1500);
    const finalRows = await countNoteRows(driver);
    expect(finalRows).toBe(beforeRows + 1);
  });

  it('editing the new note does not add further list entries', async function () {
    await switchToWebView(driver);

    const rowsBefore = await countNoteRows(driver);

    // Close drawer so the editor is fully accessible
    await ensureSidebarClosed(driver);
    await driver.pause(200);

    // Focus the ProseMirror editor via JS to avoid click-interception
    await driver.execute(() => {
      const pm = document.querySelector('.ProseMirror') as HTMLElement | null;
      if (pm) pm.focus();
    });
    await driver.pause(300);

    // Type — this triggers the autosave debounce
    await driver.keys(['Hello from regression test']);

    // Wait > autosave debounce (1000 ms) + some buffer for SAF write + watcher to settle
    await driver.pause(3000);

    const rowsAfter = await countNoteRows(driver);
    expect(rowsAfter).toBe(rowsBefore);
  });

  // ── M6.3.5 — Pinch-zoom graph ─────────────────────────────────────────────

  it('graph view survives a pinch-zoom gesture', async function () {
    // Ensure WebView context (previous test may have changed it)
    await switchToWebView(driver);

    // Open the graph view: try a palette toggle button first (multiple selector strategies),
    // fall back to the Ctrl+G keyboard shortcut if none is found.
    let paletteOpened = false;
    for (const sel of ['[data-testid="palette-toggle"]', '[aria-label="Command palette"]', '[aria-label="Open command palette"]']) {
      try {
        const btn = await driver.$(sel);
        if (await btn.isDisplayed()) {
          await btn.click();
          paletteOpened = true;
          break;
        }
      } catch { /* try next */ }
    }

    if (paletteOpened) {
      // Type to navigate to "Graph" via the palette
      try {
        const paletteInput = await driver.$('[data-testid="palette-input"]');
        await paletteInput.setValue('graph');
        await driver.pause(300);
        await driver.keys(['Enter']);
      } catch {
        // Close palette, fall through to Ctrl+G
        await driver.execute(() =>
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
        );
        paletteOpened = false;
      }
    }

    if (!paletteOpened) {
      // No palette toggle — dispatch Ctrl+G directly on the document
      await driver.execute(() =>
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, bubbles: true })),
      );
    }

    await driver.pause(1000);

    // Look for the graph canvas
    let graphContainer: WebdriverIO.Element | null = null;
    try {
      const canvas = await driver.$('canvas');
      if (await canvas.isDisplayed()) graphContainer = canvas;
    } catch { /* no canvas */ }

    if (!graphContainer) {
      this.skip();
      return;
    }

    // Pinch open gesture on the graph canvas
    await driver.execute('mobile: pinchOpenGesture', {
      elementId: (graphContainer as WebdriverIO.Element & { elementId: string }).elementId,
      percent: 0.5,
      speed: 2500,
    });
    await driver.pause(500);

    // No crash = pass; canvas still present
    expect(await graphContainer.isDisplayed()).toBe(true);

    // Close graph view
    await driver.execute(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, bubbles: true }));
    });
  });
});
