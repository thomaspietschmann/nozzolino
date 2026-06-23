# Mobile E2E Tests (Appium / WebdriverIO)

Gesture and UI tests for the Notes Android app. Replaces adb-coordinate-guessing
with proper element selectors for both native UI (SAF picker) and the React WebView.

## One-time setup

```bash
# 1. Install Appium and the UiAutomator2 driver (once per machine)
npm install -g appium
appium driver install uiautomator2
# uiautomator2 auto-manages the chromedriver needed for WebView interaction

# 2. Install test dependencies
cd apps/mobile/e2e-mobile
pnpm install
```

## Before each test run

```bash
# Build the web app and sync Capacitor assets
pnpm --filter @notes-app/mobile build
cd apps/mobile
npx cap sync android

# Build and install the debug APK onto the emulator / device
cd apps/mobile/android
./gradlew assembleDebug installDebug

# Or use the convenience script from apps/mobile/:
#   npx cap run android
```

Make sure a Pixel_9 emulator (or real Android device) is running/connected
before starting the test suite.

## Running tests

```bash
cd apps/mobile/e2e-mobile

# Full suite
pnpm test

# Gesture tests only
pnpm test:gestures
```

Appium server is started automatically by the `@wdio/appium-service` — no
separate `appium &` needed.

## Configuration

`wdio.conf.ts` — key capabilities:

| Capability | Value |
|---|---|
| `platformName` | `Android` |
| `automationName` | `UiAutomator2` |
| `appPackage` | `app.notes.mobile` |
| `appActivity` | `.MainActivity` |
| `noReset` | `true` (keeps granted SAF permission between runs) |

Set `noReset: false` (or comment out) to test the first-open / folder-picker flow.
Uncomment `appium:app` in `wdio.conf.ts` to reinstall the APK on every run.

## Context switching

The tests switch between two Appium contexts:

- **`NATIVE_APP`** — for native Android UI (SAF folder picker from `com.android.documentsui`,
  swipe gestures via screen coordinates, device buttons).
- **`WEBVIEW_app.notes.mobile`** — for the React UI running inside the Android System WebView.
  Element selectors work like CSS/DOM selectors.

```typescript
// Switch to WebView
await driver.switchContext('WEBVIEW_app.notes.mobile');

// Back to native
await driver.switchContext('NATIVE_APP');
```

## Gesture cheat-sheet

```typescript
// Edge swipe (native context — reliable screen coords)
await driver.execute('mobile: swipeGesture', {
  left: 0, top: height * 0.5, width: 40, height: 10,
  direction: 'right', percent: 0.9,
});

// Long-press a WebView element
await driver.execute('mobile: longClickGesture', {
  elementId: element.elementId,
  duration: 600,  // ms
});

// Pinch-zoom a WebView element
await driver.execute('mobile: pinchOpenGesture', {
  elementId: element.elementId,
  percent: 0.5,
  speed: 2500,
});
```

## Troubleshooting

- **WebView context not found**: The app must be fully loaded. The tests wait up to 15 s;
  increase `waitforTimeout` in `wdio.conf.ts` on slow emulators.
- **Chromedriver mismatch**: Run `appium driver update uiautomator2` — the driver
  auto-downloads a matching chromedriver on first run (needs network).
- **SAF picker text varies by Android version**: The test uses `android:id/button1`
  (resource ID) instead of button text — this is stable across Android 10–15.
- **App not installed**: Make sure `./gradlew assembleDebug installDebug` completed
  without errors. Check `adb devices` shows the target.
