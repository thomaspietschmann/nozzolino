# Releasing notes-app

Releases are driven entirely by Git tags. Pushing a tag that matches `v*`
(e.g. `v0.1.0`) triggers the release workflows; nothing else is required.

## Cutting a release

1. Make sure `main` is green and the versions are consistent. The version
   `0.1.0` lives in:
   - `package.json` (root)
   - `apps/desktop/package.json`
   - `apps/mobile/package.json`
   - `apps/mobile/android/app/build.gradle` (`versionName`)
2. Tag and push:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. CI creates/updates the GitHub Release for the tag and attaches the
   artifacts below.

## What CI produces

Three workflows fire on a `v*` tag:

| Workflow                         | Job               | Output |
| -------------------------------- | ----------------- | ------ |
| `release-desktop.yml`            | `server-image`    | Sync server OCI image pushed to GHCR (`ghcr.io/<owner>/<repo>-server:<tag>` and `:latest`) |
| `release-android-desktop.yml`    | `release-desktop` | Linux desktop `*.AppImage` and `*.deb` attached to the GitHub Release |
| `release-android-desktop.yml`    | `release-android` | Signed `notes-<tag>.apk` attached to the GitHub Release |

- Desktop artifacts are built with electron-builder (`appId
  com.notes-app.desktop`, targets AppImage + deb) into `apps/desktop/release`.
- The Android APK is built with JDK 21, `cap sync android`, then
  `./gradlew assembleRelease`, signed with the keystore from secrets.

## Required GitHub secrets

The server image uses the built-in `GITHUB_TOKEN` (no setup needed). The
signed Android build requires these repository secrets:

| Secret                      | Description |
| --------------------------- | ----------- |
| `ANDROID_KEYSTORE_BASE64`   | Base64-encoded release keystore (`.jks`/`.keystore`). Create with `base64 -w0 release.keystore` (use `base64 -b0` on macOS). |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore (store) password. |
| `ANDROID_KEY_ALIAS`         | Key alias inside the keystore. |
| `ANDROID_KEY_PASSWORD`      | Password for the key alias. |

If these secrets are absent, `assembleRelease` falls back to debug signing
(handy for local builds) — but the release CI job expects them and produces a
properly signed APK only when they are set.

> The keystore is never committed. CI decodes it to a temp file at build time
> and deletes it afterwards.

### Generating a keystore (one-time, do not commit)

```bash
keytool -genkeypair -v -keystore release.keystore \
  -alias notes -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore   # macOS: base64 -b0
```

Paste the base64 output into `ANDROID_KEYSTORE_BASE64` and set the matching
password/alias secrets.

## Running the sync server image

After a release the server image is available on GHCR:

```bash
docker run -d \
  -p 8080:8080 \
  -e SYNC_TOKEN=your-secret-token \
  -v notes-data:/data \
  ghcr.io/<owner>/<repo>-server:v0.1.0
```

Replace `<owner>/<repo>` with your GitHub repository (lowercased). The server
listens on port `8080`, stores the vault in the `/data` volume, and
authenticates requests with `SYNC_TOKEN`.
