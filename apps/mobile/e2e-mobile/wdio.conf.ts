import type { Options } from '@wdio/types';
import path from 'path';

// Path to the debug APK built by Gradle.
// Build it first: cd apps/mobile/android && ./gradlew assembleDebug
const APK_PATH = path.resolve(
  __dirname,
  '../android/app/build/outputs/apk/debug/app-debug.apk',
);

export const config: Options.Testrunner = {
  runner: 'local',
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      project: path.resolve(__dirname, 'tsconfig.json'),
      transpileOnly: true,
    },
  },

  port: 4723,

  services: [
    [
      'appium',
      {
        args: {
          relaxedSecurity: true,
        },
        // ANDROID_HOME must be in the process environment before running:
        //   export ANDROID_HOME=~/Library/Android/sdk
        // The package.json test scripts inject this automatically.
        logFileName: 'appium.log',
        outputDir: __dirname,
      },
    ],
  ],

  capabilities: [
    {
      platformName: 'Android',
      'appium:automationName': 'UiAutomator2',
      'appium:appPackage': 'app.notes.mobile',
      'appium:appActivity': '.MainActivity',
      // Keep SAF permissions and saved vault URI between test runs.
      // Remove this to test the first-open / SAF-picker flow.
      'appium:noReset': true,
      'appium:newCommandTimeout': 120,
      // Uncomment to reinstall the APK on each run:
      // 'appium:app': APK_PATH,
    },
  ],

  logLevel: 'info',
  bail: 0,
  waitforTimeout: 15000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
  },

  specs: ['./tests/**/*.e2e.ts'],
};

// Make TypeScript happy — APK_PATH is referenced but may not be used at runtime
void APK_PATH;
