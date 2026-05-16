## Supabase setup

Two SQL files. Run them once via the Supabase SQL editor (or `supabase db push` if you wire up the CLI):

1. `migrations/001_init_schema.sql` — table, indexes, private storage bucket. Idempotent.
2. `migrations/002_rls_policies.sql` — **DESTRUCTIVE**: wipes existing `meetings` rows (legacy `user_id='demo-user'` text values incompatible with the new `uuid` model), converts `user_id` to `uuid`, enables RLS, and installs policies for the table and the `audio-recordings` bucket.

### Auth model

The app uses **Supabase Anonymous Sign-In**. Each install gets a persistent `auth.uid()` on first launch (session stored in `expo-secure-store`). RLS policies pin every row and every storage object to `auth.uid()`.

Enable anonymous sign-in in the dashboard:
**Authentication → Providers → Anonymous** → toggle on.

### Why a service-role key on the backend?

The FastAPI pipeline updates `status`, `transcript`, `summary`, etc. on rows owned by end users. It uses `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS. This is the standard split:

- **Client (anon key)** — bound by RLS to the signed-in user.
- **Server (service-role key)** — trusted process, bypasses RLS to write pipeline output.

The service-role key never reaches the client.

### Storage path convention

`audio-recordings/{auth.uid()}/{meeting_id}.m4a`

Storage policies enforce that the first path segment matches `auth.uid()::text` — a user cannot read or write outside their own folder.
