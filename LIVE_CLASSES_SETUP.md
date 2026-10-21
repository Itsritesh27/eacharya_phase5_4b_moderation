# Live classes (LiveKit) setup

Teachers schedule a class for a course; enrolled students join inside eAcharya (video, chat, raise hand);
the teacher sees who attended and for how long. Video runs on LiveKit Cloud; eAcharya never stores video.

## 1. Install packages
```
npm install
```
`package.json` already lists `livekit-server-sdk`, `livekit-client`, `@livekit/components-react`, `@livekit/components-styles`.

## 2. Run the database migration
Supabase -> SQL editor -> run `supabase/migrations/20261103000001_live_classes.sql`.
Optional check (rolls back, keeps nothing): `supabase/tests/live_classes_rls_checks.sql`.
Undo: `supabase/rollbacks/20261103000001_live_classes_rollback.sql` (deletes all live-class data).

## 3. Create a LiveKit project
cloud.livekit.io -> new project -> Settings -> Keys. Copy the WebSocket URL (`wss://...livekit.cloud`), API key and secret.

## 4. Environment variables (Netlify -> Site settings -> Environment, and `.env.local` locally)
| Name | Value | Required |
|---|---|---|
| `LIVEKIT_URL` | `wss://<project>.livekit.cloud` | yes |
| `LIVEKIT_API_KEY` | from LiveKit | yes |
| `LIVEKIT_API_SECRET` | from LiveKit (server only, never `NEXT_PUBLIC_`) | yes |

## 5. Attendance
Attendance is recorded by the app itself: a student is marked present when they join, and their time is counted when they leave
(Leave button, class ended by the teacher, or closing the tab). No webhook and no service-role key are used, which keeps the
project rule that the service-role key is never referenced under `src/`.
If the browser crashes or loses power the time may be counted until the teacher ends the class.

## How access works
- Join goes through `POST /api/live-sessions/[id]/token`. The server checks sign-in, then asks the database whether the user owns the class (host) or is enrolled in its course (participant), then checks the time window, then issues a 3-hour token.
- Students may enter 10 minutes before the start until 30 minutes after the end (or any time while the teacher has the class live). Teachers may open the room an hour early.
- Students enter with camera and mic off. Teachers can mute or remove people from the room controls, and "End class" disconnects everyone.

## Cost note
Each person in the room counts as participant-minutes. 35 students x 60 minutes is about 2,100 minutes per class, so the free plan covers roughly two such classes a month; regular classes need a paid plan.

## Files added
- `supabase/migrations/20261103000001_live_classes.sql`, `supabase/rollbacks/...`, `supabase/tests/live_classes_rls_checks.sql`
- `src/lib/live-sessions/` (rules, validation, data, actions, livekit server helper) and `rules.test.ts`
- `src/app/api/live-sessions/[id]/token/route.ts`, `src/app/api/live-sessions/[id]/leave/route.ts`
- `src/app/live/[id]/page.tsx` (the room), `src/app/dashboard/teacher/live/` (schedule, attendance), `src/app/dashboard/student/live/`
- `src/components/live/`; "Live Classes" added to the teacher and student sidebars.

## Verification
Database migration and access rules: run on local Postgres (15 checks pass). `npm run typecheck` and the live-class unit tests pass on the owner's machine.
Two older tests fail that are not caused by live classes (see chat): `paper-view.test.ts` (an existing assessments file mentions `secondsRemaining`).
A real video call still needs to be tried with a teacher and a student.
