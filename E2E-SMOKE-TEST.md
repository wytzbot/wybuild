# WyDev E2E Smoke Test

Run after deploying with real sandbox credentials.

## 1. Authentication
- Open `/api/auth/github`.
- Authorize the GitHub OAuth app.
- Confirm the app returns to `/`.
- Confirm `/api/auth/me` returns the GitHub account.
- Confirm sign-out clears the session.

## 2. Repository workflow
- Open a private repository.
- Switch branch.
- Open a text file.
- Edit it.
- Reload the app before committing and confirm local state is preserved by the app's local storage.
- Create a file.
- Delete a file.
- Upload a folder.
- Rename a folder.
- Confirm the reference warning lists matching paths/lines.

## 3. Push protection
- Make a local edit.
- Change the same branch directly on GitHub.
- Attempt Commit & Push.
- Expected: HTTP 409 / "Repository changed on GitHub".
- Confirm no force push occurs.

## 4. AI
- Supply a real compiler/stack-trace error and minimum related file context.
- Confirm the response contains root cause, affected files/lines, evidence, recommended action and confidence.
- Confirm the AI response never directly modifies the working tree.
- Repeat until the daily sandbox quota is reached; expected response is 429.
- Temporarily make the primary model unavailable; confirm fallback is attempted.

## 5. Flutterwave sandbox
- Configure v4 sandbox OAuth credentials.
- Configure the browser encryption key.
- Start a Pro checkout.
- Complete any required authorization/3DS step.
- Confirm the webhook reaches `/api/billing/webhook`.
- Confirm the server re-verifies the charge.
- Confirm `wydev_entitlements/{githubUserId}` becomes active.
- Confirm `/api/billing/status` reports Pro.
- Send the same webhook again; expected: no duplicate entitlement side effects.

## 6. Firebase
- Confirm Firestore contains only:
  - `wydev_entitlements`
  - `wydev_transactions`
  - `wydev_ai_usage`
- Confirm there are no repository source files stored there.
- Confirm direct client access is denied by Firestore rules.

## 7. Mobile UX
Test on a real Android phone:
- editor keyboard open
- long file
- long line
- copy entire file
- select all
- replace entire file
- file tree scrolling
- folder upload
- rename folder sheet
- commit bar above keyboard
- Android back behavior
- portrait and rotation where supported
- small/medium/large interface font settings

## 8. Failure cases
Verify clear messages for:
- expired GitHub authorization
- missing repository permission
- 404 file
- large file
- GitHub rate limit
- remote branch changed
- invalid commit message
- AI timeout
- AI quota exceeded
- Flutterwave rejected payment
- invalid webhook signature
- Firebase unavailable

Never mark a failed operation as successful.
