# Share Toilet — first iOS App Store release

## Isolation and identifiers

- Development worktree: `share-toilet-ios-store`, branch `release/ios-appstore-20261028`.
- Baseline: `4b47abb856838fcc56b63d7ea7de1f58ed88a352` from `github/main`.
- Bundle ID `com.sharetoilet.app`; version/build `1.0 (1)`; minimum iOS 15.
- Apple explicit App ID registered. Owner-selected Store name **모두의 공중화장실** accepted; App Store Connect record **6828007172** created and read back at version **1.0 / 제출 준비 중**. Original name 모두의 화장실 was unavailable.
- Store record: https://appstoreconnect.apple.com/apps/6828007172/distribution
- Do not push main: main triggers the existing Android/web OTA workflow. Existing Android app, OTA and water app are separate releases.

## iOS implementation

Official Capacitor iOS 6.2.1 project with location permission, Naver URL scheme, icons/splash and required API privacy manifests. iOS plugin allowlist excludes AdMob and Capgo Updater. Android behavior remains unchanged. Local toilet status records are not a public user-content feed. Support/privacy links and OpenStreetMap route attribution are included. Public title arguments in info-window HTML are escaped.

Public documents (live verified):
- https://seungiljang.github.io/privacy/share-toilet.html
- https://seungiljang.github.io/privacy/share-toilet-support.html

Location privacy declarations are a candidate, not a published App Store privacy response. Reconcile the Naver web map and routing service processing before answering the final questionnaire. Do not copy water's public-contributor declarations.

## Evidence and unresolved gates

- Node tests: 7 passed.
- Signing-guard tests: 10 passed, including lock rejection and owned-process/sleep-assertion cleanup. Live unlocked check correctly reports the absent account; live screen-lock transition has not been deliberately induced.
- iOS simulator build: passed.
- `ToiletStoreQA/testRegionalSearchAndPanel`: passed (363.038 seconds); regional results, panel and support link verified.
- Simulator location callback returns correctly; bundled toilet data fallback works.
- **Map rendering failed:** Naver JS API reports error 500 for `capacitor://localhost`; map remains blank. Ncloud application/origin inspection awaits owner login. Do not call it resolved or use blank-map screenshots as Store assets.
- Map-selection/route UI test exists but has not passed/run after the map failure. Physical iPhone toilet interactions and iPad layout remain unverified.
- Candidate archive `release/share-toilet-ios-appstore-20261028/ShareToilet-1.0-1-candidate.xcarchive`: archive succeeded, **not release-ready**.
- Distribution export failed with No Accounts. No toilet IPA uploaded, review submitted or public launch performed.
- Store description, privacy, screenshots, supported-device validation, pricing and territory configuration remain to be completed after the record exists. Review contact phone is already in the private water release draft; reuse only its contact fields, not its product-specific notes.

## Signing workflow and account-loss prevention

Use `npm run ios:store:preflight` and `npm run ios:store:xcodebuild -- <arguments>`. They pin the intended Xcode installation, verify the current console session is unlocked, compare account presence on disk and in defaults, and never modify account stores. The signing wrapper temporarily inhibits display/idle sleep and stops its own process on manual re-lock. It does not prevent a user from locking the Mac or repair a discarded account automatically.

On this Mac, provisioning at 22:29:02 on October 28 coincided with securityd locked-Keychain errors (-25308), Xcode missing-Xcode-Username warnings, then zero saved accounts. This supports a screen-lock/data-protection-Keychain failure path; an unlocked login Keychain alone does not rule it out. After the owner unlocks and signs in once, validate export with the guarded workflow. Do not retry provisioning while locked, reset Keychain, delete certificates or copy authentication tokens. Apple server sessions can still expire independently.

## Resume

1. Store record creation is complete. Fill and read back its product metadata while remaining release gates are resolved.
2. Inspect the intended Ncloud application after owner login and resolve real iOS map rendering. Do not borrow water's native Client ID or spoof origins.
3. Restore Xcode sign-in once while unlocked, then use the guard for all provisioning.
4. Validate map selection, walking routes, local status persistence, external navigation and supported device layouts. Capture only release UI with synthetic location.
5. Rebuild final archive, verify distribution IPA, upload, wait for processing, fill/save/read back metadata and privacy, then submit the intended build for review. Report review submission separately from Apple approval/public availability.

### Account UI versus command-line discrepancy

Owner supplied a current Apple Accounts screenshot showing a registered Apple account and Admin team. Both legacy preference arrays still read zero, but that alone does not prove UI logout. Updated the preflight to treat zero legacy entries as diagnostic, not a hard failure. An unlocked, guarded distribution-export attempt still returned No Accounts (exit70), without a missing-Xcode-Username warning. Account presence in the UI is confirmed; command-line provisioning is not working yet. Preserve the account and inspect a normal Xcode refresh/relaunch before requesting another sign-in. Do not conflate this observation with the earlier correlated screen-lock failure.
