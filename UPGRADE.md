# Plus Ultra Tutoring — personalisation and editing update

This version starts from the latest ZIP you supplied. Your Firebase configuration, username sign-in, tutor-created student logins, Google sign-in, student profiles, and logo are retained.

## Install on your existing GitHub Pages site

1. Keep a copy of your current repository or ZIP as a backup.
2. Upload the contents of this new ZIP to the repository root. Keep the `js` folder intact, and replace the existing versions when prompted. Your Firebase configuration in this ZIP is unchanged from the supplied source.
3. Commit the upload and wait for the Pages deployment to finish.
4. **In Firebase Console → Firestore Database → Rules, replace the rules with the included `firestore.rules` and click Publish.** Uploading that file to GitHub does not deploy database rules. No Storage rule change is required for this update.
5. Refresh the website with Ctrl+Shift+R. Check the tutor view and a separate student account.

New files: `js/customisation.js`, `js/editing.js`, `customisation.css`, `tests/features.test.js`, and this guide. Updated runtime files: `index.html`, `js/app.js`, `js/store.js`, `js/firebase.js`, and `firestore.rules`.

## New behaviour

- **Customisation:** Both roles have a navigation item, also visible in the mobile hamburger menu. Choose Lavender, Ocean, Forest, Rose, Sunset, or Indigo. The theme applies immediately and saves per account in that browser. Different accounts on the same browser can have different preferences. This preference does not sync between devices.
- **Settings:** Only tutors see or can navigate to Settings in the app. The app's change-password action is tutor-only. Student views do not show Firebase setup or the password-change form. Firebase Web configuration is still public client configuration; role-based record access remains enforced by Firestore rules.
- **Goals:** In a student's profile, use Edit goal to correct its title or progress percentage. Existing goal IDs and other goals are preserved.
- **Assignments:** Open a task and use Edit assignment. Correct the title, subject, instructions, due date, or resource link; an assigned task's type can also be changed. For completed work, feedback and score can be corrected. Submissions, attachments, ownership, and lifecycle status are preserved. Changes apply to that student's copy when a task was assigned to several students.
- **Assessments:** Use Edit beside any result in a student's assessment history. The list now includes all results, while the chart shows the latest seven. A result linked to an assignment also updates that assignment's score. Changing a completed assignment's score updates its linked assessment, or creates a result if needed. An existing score must be corrected to another number rather than cleared.
- **Notes:** Use Edit note under a private session observation. Notes stay private to the tutor.
- **Sessions:** Tutors can edit the subject, focus, date, time, and duration. Students get an Upcoming sessions page and a dashboard panel containing only their own upcoming or in-progress sessions. Existing sessions are found by their student ID, so no manual backfill is needed. Scheduling still uses the tutor's local wall-clock time; there is no automatic timezone conversion.

Editing assessment scores does not automatically change a goal percentage. Use Edit goal to correct your assessment of goal progress. This update adds editing, not permanent deletion or reassignment of records.

## Validation

Run `npm test` and `npm run check` in this folder (Node.js required; no dependency installation needed). Tests cover the original lifecycle plus record edits, linked score consistency, student session filtering, tutor-only mutations, per-account theme isolation, and rendered navigation/settings guards.

Eleven tests passed during preparation. Live Firebase syncing, rules execution in an emulator, and visual browser rendering have not been verified in this environment. Before rolling out, test a tutor and two student accounts against your Firebase project: each student should see only their own sessions, and should be unable to write sessions, goals, notes, assessments, or tutor-only assignment fields. Publish the updated rules before testing these features.

No existing Firestore documents are deleted or reset by this update.
