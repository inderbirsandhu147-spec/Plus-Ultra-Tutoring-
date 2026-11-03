# Chat and Google Drive update

This update preserves your v2 configuration, customisation, logo, account login, editing features, and existing data. There are two separate setup steps: chat works with Firestore; Google Drive attachments need a deployed backend and your Google authorization.

## 1. Install the app and activate chat

1. Upload the contents of this ZIP to the root of your GitHub repository, keeping the `js` folder intact. Replace the previous versions and commit.
2. In Firebase Console → Firestore Database → Rules, publish the included `firestore.rules`. Uploading rules to GitHub does not publish them.
3. Refresh the app after Pages deploys. Both roles now have **Messages** in navigation, including the mobile menu. Tutors choose a student; students can message their own tutor. Messages update live while the conversation is open.

Messages are text-only (up to 5,000 characters) and show the latest 100. Older messages remain stored. There are no push/email notifications, read receipts, editing, or deletion of messages in this version. Chat uses Firestore, not Google Drive. New messages are stored at `students/{studentId}/messages/{messageId}`. Rules check the student profile, sender UID, sender role, and server timestamp. Other students cannot read or send messages in that conversation.

Until you enable Drive below, attachments continue to use your existing Firebase Storage setup. Existing Firebase files remain downloadable after Drive is enabled. Files are not automatically migrated.

## 2. Set up the secure Drive backend

The app must not contain Google refresh tokens or client secrets. The included Firebase Functions backend stores Google authorization privately in Firestore and checks the signed-in user on every upload/download. Students never receive your Google access token or a public Drive sharing link.

### Requirements

- The same Firebase project as your app, with billing enabled for Cloud Functions and Secret Manager.
- Node.js 22 and the Firebase CLI on your computer. Install the CLI with `npm install -g firebase-tools` if needed.
- Permission to configure Google OAuth and the Drive API in your Google Cloud project.

### Configure Google

1. In Google Cloud Console, select your Firebase project's underlying Cloud project.
2. Enable **Google Drive API**.
3. Configure the Google Auth Platform consent screen (app name, your support email, audience). For initial testing, add your own Google account as a test user. Students do not need Drive access or to be OAuth test users; only the tutor connects Drive.
4. Add the scope `https://www.googleapis.com/auth/drive.file`. It permits files created/opened by this app, rather than access to your whole Drive.
5. Create an **OAuth client ID → Web application**. Its authorized redirect URI must be exactly:

   `https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/driveCallback`

   Replace `YOUR_PROJECT_ID` with the `projectId` in your existing `firebase-config.js`.
6. Copy the client ID and client secret somewhere private for the next step. Do not put them in a GitHub file.

In External/Testing mode, Google normally expires Drive refresh tokens after seven days. Move to the appropriate production publishing state before relying on the connection for everyday use; Google may ask for app details, a privacy policy, and review depending on your audience and configuration. Reconnect from Settings when authorization is revoked or expires.

### Deploy Firebase Functions

Open a terminal in the extracted app folder:

```sh
firebase login
firebase use --add
```

Choose your **existing tutoring Firebase project**. Then:

```sh
firebase functions:secrets:set DRIVE_CLIENT_ID
firebase functions:secrets:set DRIVE_CLIENT_SECRET
```

Paste the OAuth client ID and secret into the respective interactive prompts. Then install the backend packages and deploy:

```sh
npm --prefix functions install
firebase deploy --only functions,firestore:rules
```

This deploys two functions in `us-central1`: `driveApi` and `driveCallback`. They are HTTP endpoints: Google must reach the callback without Firebase sign-in, while the API verifies Firebase ID tokens itself. If deployment asks to permit public invocation, this is needed for these endpoints; application authentication is enforced in the code. Default runtime service-account access to Firestore and configured Secret Manager secrets is required. Firebase normally provisions these permissions during deployment.

### Enable Drive in the website

Edit `integrations-config.js`:

```js
export const driveApiURL = 'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/driveApi';
```

Use the actual deployed function URL if Firebase prints a different one. Do not use the `driveCallback` URL here. Commit this file to GitHub and wait for Pages deployment.

1. Sign in as tutor and open **Settings → Google Drive attachments**.
2. Select **Connect Google Drive**.
3. Sign in to your Google account and approve the requested app-file access.
4. The callback confirms the connection. Return to the tutoring app and refresh Settings.
5. Choose **Check connection**. A successful connection creates a private **Plus Ultra Tutoring Attachments** folder in your Google Drive.
6. Create an assignment resource or student submission with a small test PDF. Confirm it appears in that folder and can be downloaded by its tutor and assigned student.

Once a Drive endpoint is configured, new uploads require the tutor's Drive connection. Failed Drive uploads do not silently fall back to Firebase. To keep using Firebase Storage instead, leave `driveApiURL` blank. Old Firebase attachments keep working either way.

## Privacy and behaviour

- Google Drive stores both tutor resource attachments and student submission files, up to 10 MB per file. Drive storage quota belongs to the connected tutor's Google account.
- Students can upload a submission only to their own assigned task. Only its tutor can upload resources. Downloads are authorized against the current assignment ownership.
- Direct Drive file access is never granted to students. A backend-generated opaque asset ID is stored with the assignment; downloads are proxied through the authenticated backend.
- Google refresh tokens are stored in the private `driveConnections` collection under the tutor UID; OAuth state/PKCE data is in `driveOAuthStates`; file mappings are in `driveFiles`. The supplied rules deny browser access to all three. Tokens use Google-managed encryption at rest via Firestore. Never broaden these rules to public access.
- Reconnect using the same Google account to retain access to older Drive attachments. Each connection creates a new folder for subsequent files. Connecting a different Google account may prevent downloads of previous attachments.
- Deleting or moving files outside the connected account's access in Drive can break downloads. Uploads abandoned before submission can leave unreferenced files; the tutor can clean these up in Drive.
- Message bodies are escaped before rendering. File types and size are checked by the browser and backend; this does not perform malware scanning.
- The backend allows cross-origin requests for GitHub Pages and authenticates every API call with a Firebase ID token. Production traffic, quotas, backups and billing should be managed in your project. No connection has been made to your personal Drive during preparation.

## Checks

Run `npm test`, `npm run check`, and `node --check functions/index.js` from the app folder. Automated tests cover private chat persistence, bidirectional messages, student conversation isolation, and backend upload authorization in addition to the v2 tests.

Live Google OAuth, Functions deployment, Firestore rule execution, real file upload/download and browser visual rendering still need verification in your project. Test with a tutor and two students before using real messages/files.

Official references: [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [Google OAuth and refresh tokens](https://developers.google.com/identity/protocols/oauth2), [Firebase HTTP functions](https://firebase.google.com/docs/functions/http-events), [Firebase secrets](https://firebase.google.com/docs/functions/config-env).
