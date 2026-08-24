# Safety Reporting & Account Deletion — Specification

Status: **approved, in build.** Covers (A) reporting/moderation enhancements and
(B) replacing the current anonymize-in-place account deletion with a real delete plus
a pseudonymous statistics record.

Decisions taken:

- Messages, media and call history already sent to another user are **retained** in
  that user's history, attributed to a deleted user (B5).
- Deleted users render in the app as a masked "Deleted user" with a placeholder
  avatar and no profile, call or connect actions (B5).
- Bans are a server-side decision. The client may report signals, never command a
  ban (A0).
- Admin identity lives in its own `Admin` model. The User model is not extended for
  moderation, roles or admin flags (A0).
- Safety retention is conditional on the user actually having a report or ban (B6).

Open for legal only: indefinite vs fixed 5-year retention for permanent bans (B6).

Build order: A0, A3, A1, A6, A7 (backend done), B (backend done) → A2, A4, A5, A8 (iOS).

Not yet built, tracked separately:

- iOS rendering of a deleted user as a masked "Deleted user" (B5).
- TTL purge jobs for retained reports and bans (B6).
- Ban-evasion check at signup against `DeletedUser.phoneHash` (B6).
- `DeletedUser.country` — Location stores coordinates only; needs a geocode step.
- The `Admin` model that `requireAdmin` resolves against. Until it exists every
  `/api/moderation/*` admin route denies, so the review queue is mounted but locked.

---

## Part A — Reporting enhancements

### A0. Move the ban decision server-side *(bug — ship blocker)* — **DONE**

Two faults, not one. `POST /api/moderation/ban` had no authorization beyond a valid
user token, so any authenticated user could ban any other user by ID. Worse, the ban
was **client-authoritative**: `HarassmentMonitor.checkForBan` counted warnings in
local client state and instructed the server to ban. Warnings reset on reinstall, and
the endpoint could be called directly for any user ID.

Implemented:

- `requireAdmin` middleware in `middleware/verify.js`, applied to
  `POST /api/moderation/ban`. It resolves admin identity against a separate `Admin`
  model (`{ user, active }`) — **the User model is never extended with moderation
  concerns**. Until that model is built, the middleware denies all requests, which
  leaves `/ban` safely locked.
- `POST /api/moderation/log` stays open to authenticated users (it is safety
  telemetry), but the event is now attributed to the token, not to a `userId` in the
  request body.

Follow-up required: the iOS `HarassmentMonitor.checkForBan` call now receives 403.
It is wrapped in `try?` so it fails silently, leaving the client-driven auto-ban
inert. Remove that call site and replace the behaviour with A7.

### A1. Make reports reviewable — **DONE**

`api/controllers/report.controller.js` already implements `getPendingReports` and
`updateReportStatus`, but the controller is not mounted on any route. Reports are
written to the database and are unreachable by any API.

- Mount behind `requireAdmin`:
  - `GET  /api/moderation/reports` — paginated queue, filter by status
  - `PATCH /api/moderation/reports/:reportId` — set status + `actionTaken`
- `actionTaken` values already modelled: `warning_issued`, `temporary_restriction`,
  `permanent_ban`, `dismissed`. Wire each to a real effect (currently they only
  update the report document).

### A2. Couple report to block

The report sheet has no block option, so a user who reports someone keeps receiving
their messages. Apple's UGC guidance expects both mechanisms available together.

- Add "Also block this user" toggle to `ReportUserView`, **default on**.
- On submit, call the existing block endpoint. Block is already fully enforced
  server-side, so this is client-side work only.

### A3. Fix the dropped report category — **DONE**

`ReportReason.outsidePressure` ("Excessive Pressure to Chat or Call") is sent as
`outside_pressure`, which is absent from `REPORT_TYPE_ENUM`
(`user.controller.js:390`). Line 428 silently rewrites it to `other`. Winky's most
product-specific category is being discarded on every submission.

- Add `outside_pressure` to `REPORT_TYPE_ENUM` **and** to the `type` enum in
  `models/report.js` — the schema enum will reject the save otherwise.

### A4. Capture evidence at report time

The API accepts an `evidence` array of message IDs, but `ReportUserView` only takes
a `userId` and never sends one — so `report.message` is always null. Even when
populated it is a reference, so evidence disappears if the message is deleted.

- Add a message-level report entry point (long-press a message → Report).
- Store a **snapshot** on the report: message text, media URL, and timestamp copied
  at submission, not just the ObjectId.

### A5. Correct the in-app copy

`ReportUserView.swift:120` displays "Reports are reviewed immediately. Harassment =
immediate restriction or removal." under a "Zero Tolerance Policy" badge, and the
success alert repeats "We'll review this report immediately." Neither is true until
A1 ships. App Review reads this screen.

- Reword to describe the process without a timeline commitment, or ship A1 first.

### A6. Rate limiting and duplicate suppression — **DONE**

No limit on report creation. Once A7 exists, that becomes a brigading vector.

- Cap reports per reporter per 24h.
- Collapse repeat reports of the same target by the same reporter into one record
  with an occurrence counter.

### A7. Automated action on patterns *(after A1 + A6)* — **DONE**

`report.service.js:195` already computes low/medium/high risk tiers from 30-day
report volume, then only `console.log`s the result.

- High risk → automatic temporary restriction + queue for human review.
- Never auto-ban without review.

### A8. Reporter feedback

`getMyReports` exists and returns only resolved reports. Surface it in the app so a
reporter can see their report was actioned.

---

## Part B — True hard delete

### B1. Current behaviour (being replaced)

`hardDeleteAccount()` is a misnomer — it calls `softDeleteAccount()`, which keeps the
User document, masks name/email/phone/photo, and sets `deleted: true`. Nothing is
removed, no purge job exists, and messages stay visible to the other party under
"Deleted User XXXXXX".

### B2. Target behaviour

Delete the user's account, profile and identifiers outright. Retain a `DeletedUser`
record carrying no direct identifiers (B3), plus content already delivered to other
users (B5), plus safety records only where they exist (B6).

### B3. `DeletedUser` schema (replaces the current one)

```js
{
  userId: ObjectId,        // original _id, kept as pseudonymous key (no ref — User is gone)

  // Hashed identifiers — HMAC-SHA256 keyed with OTP_PHONE_HASH_SECRET
  phoneHash:   String,     // copy of the former user.partition (already this exact hash)
  emailHash:   String,     // lowercased + trimmed before hashing
  appleIdHash: String,
  googleIdHash:String,

  deletedOn: Date,
  reason:    String,       // 'User initiated' | 'Admin' | 'Ban'

  // Statistics — deliberately coarse
  registeredOn:    Date,
  lastLogin:       Date,
  accountAgeDays:  Number,
  authProvider:    { apple: Bool, google: Bool, phone: Bool },
  gender:          String,
  ageBucket:       String,   // '18-24' | '25-34' | '35-44' | '45-54' | '55+'
  interestedIn:    String,
  devicePlatform:  String,
  country:         String,   // country code only, derived from last known location

  activity: {
    messagesSent:   Number,
    chatsCount:     Number,
    connectionsCount:Number,
    callsCount:     Number,
    reportsFiled:   Number,
    reportsAgainst: Number,
    wasBanned:      Boolean,
    timesBlocked:   Number,
  }
}
```

**Why HMAC, not plain SHA-256.** Phone numbers are low-entropy; a plain hash of one
is brute-forceable in seconds and would still legally be personal data. The keyed
HMAC with a server-held pepper is not reversible without the key. This is already
how `partition` works, so no new crypto is introduced.

**Why an age bucket, not an exact age.** Exact age + gender + signup date is close to
re-identifying. Buckets keep the cohort statistics useful while keeping the record
genuinely anonymous.

**What the hashes are for.** Re-registration detection, ban-evasion enforcement, and
deduplicated signup statistics — without storing a phone number or email.

### B4. Cascade — hard delete

Delete outright:

- `User` (the document itself, deleted last)
- `Device`, `UserSession`, `OtpSession`
- `Location` (all history)
- `E2EEDevice`, `E2EEKeyBackup`, `KeyBackup`, `KeyEscrow`
- `ContentStorage` and any `Media` **not attached to a delivered message**, including
  the S3 objects
- `ProfileView` (both directions), `NearbyUsersLog` (both directions)
- `UserSaved`, `UserMuted`, `UserDisappeared`, `UserRequest`, `UserConnectStatus`
- `BlockUser` (both directions), `PendingSocketEvent`
- `CallRequest` (transient signalling)
- `$pull` the user's id from every other user's `favorites` and `hiddenUsers` arrays

### B5. Messages, media and calls — retained for the other party

**Principle.** What was sent to someone is theirs. The deleted user's account,
profile and identifiers are destroyed; content already delivered to another user
stays in that user's history, attributed to a deleted user.

This is also what E2EE produces on its own: the recipient decrypts with their own
keys, so their copy survives regardless of what the sender deletes.

**Messages** — rows and `content` retained, media retained. Delete only:

- `senderCopy` (the sender's own encrypted copy) on every message they sent
- all key material (listed in B4), which crypto-shreds anything only they could read

`from` keeps the original ObjectId, which no longer resolves. The API must render a
null `from` as a deleted user rather than failing to populate.

**Chat membership** — retained with `canChat: false` and a `deleted` marker. Do not
remove the membership row: `chat.handler.js:518` treats a private chat with fewer
than two `canChat` members as invalid, so removal would break the surviving user's
thread. Retaining it read-only lets them see history but not send.

**Calls** — `CallHistory` rows retained so the other party keeps their call log. No
recordings exist; the model is metadata only. Strip the deleted user's personal
fields: null `ipAddress` and `networkInfo`.

**App-side presentation.** The client renders a deleted user as a masked
"Deleted user" — placeholder avatar, no profile to open, no call or connect actions.
Because the `User` document is gone, this is driven by an unresolvable reference, not
by a `deleted` flag on a surviving record.

**Consequence for the Terms.** The claim is: account, profile and personal
identifiers are permanently deleted; messages and calls you sent remain visible to
their recipients. Not "all your data is deleted".

### B6. Retention for safety

Retention is **conditional**: if the user was never reported and never banned, keep
nothing beyond the B3 tombstone.

**Tier 1 — enforcement.** `phoneHash` + ban status + expiry only. Checked at signup to
refuse re-registration while a ban is live. Retained for the ban duration; permanent
bans indefinite (open: lawyer may prefer a fixed 5-year window).

**Tier 2 — evidence.** Full report bodies, descriptions, message snapshots. TTL purge
12 months after **resolution** (not creation, so open investigations survive review).
`reported` ref re-keyed to the pseudonymous `userId`.

**Dismissed reports.** Purge 90 days after dismissal — already determined unfounded.

**Reports they filed.** Retained, `reporter` nulled to anonymous. The accused's record
must not vanish because the reporter left.

**Legal basis**, to be stated explicitly in the Privacy Policy: legitimate interest in
platform safety, and establishing/defending legal claims. Rationale: a report is also
the reporter's record and may form a pattern with other users' reports.

### B7. Execution and failure handling

Mongo multi-document transactions require a replica set, so the cascade must be
idempotent instead:

1. Write the `DeletedUser` tombstone **first**, so statistics survive a mid-run crash.
2. Set `User.deletionStatus = 'in_progress'`; the account cannot authenticate from
   this point.
3. Run the cascade in stages, each safely re-runnable.
4. Delete the `User` document last.
5. Log failures to a retry queue and re-run; a partially deleted account must never
   be reachable.

No grace period — deletion is immediate and irreversible, matching the Terms.

### B8. Consequences for the Terms

Once shipped, the Terms may state that account data is deleted rather than
deactivated, provided the B6 safety carve-out and its retention window are disclosed.
Until then the accurate wording is deactivation and anonymization.
