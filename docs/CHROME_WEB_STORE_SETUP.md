# Chrome Web Store API setup

One-time setup for automatic publishing from GitHub Actions. It produces four
repo secrets, plus one repo variable:

| Secret | Value |
|---|---|
| `CHROME_EXTENSION_ID` | the id in the store URL (`jiahfbbfpacpolomdjlpdpiljllcdenb`) |
| `CHROME_CLIENT_ID` | Google OAuth2 client id |
| `CHROME_CLIENT_SECRET` | Google OAuth2 client secret |
| `CHROME_REFRESH_TOKEN` | long-lived OAuth2 refresh token |

1. In [Google Cloud Console](https://console.cloud.google.com/), create a
   project and enable the **Chrome Web Store API**.
2. Configure the OAuth consent screen (External), add the extension owner's
   account as a test user.
3. Create an **OAuth client ID** of type Web application with redirect URI
   `https://developers.google.com/oauthplayground`; keep the client id and
   secret.
4. In the [OAuth Playground](https://developers.google.com/oauthplayground/),
   open the gear menu, tick "Use your own OAuth credentials", enter the client
   id and secret, authorize the scope
   `https://www.googleapis.com/auth/chromewebstore` with the account that owns
   the extension, and exchange the code for the refresh token. (Alternative:
   `npx chrome-webstore-upload-keys`.)
5. Add the four secrets under repo Settings, Secrets and variables, Actions.
   Also add the repo variable `CWS_PUBLISHER_ID` (the publisher id on the CWS
   developer dashboard's Account page; not a secret). The Chrome Web Store API
   v1.1 shuts down on 2026-10-15; publishing uses API v2, which needs it.

Then bump the version in `package.json` (the build syncs it to the manifest),
tag `v<version>` and push the tag. `release.yml` builds, creates the GitHub
Release and uploads to the store when the secrets exist; without them the
release still succeeds.

## Troubleshooting

- **Upload failed: 403:** the account that made the refresh token must own the
  extension, and the API must be enabled in the project.
- **Token expired:** create a new refresh token (step 4) after any access
  revocation.
- **Version already exists:** raise the version before tagging; every upload
  needs a higher one.
- **Item not found:** check `CHROME_EXTENSION_ID`.
- The Google account needs 2-step verification. Review usually takes one to two
  business days.
