# Safe pre-application testing checklist

Nothing in this checklist has been executed by the agent. Use a disposable Supabase test project/local Supabase environment, not production user data. Do not disable RLS, expose the private schema, or paste secrets into chats. This initial migration is not an upgrade script: if any of its tables/schema already exist, stop and investigate rather than dropping them to make it run.

## 1. Verify migration and effective permissions

- Apply the full migration once in the disposable environment using its trusted database/migration owner. Confirm it commits with no errors and creates only the intended tables/functions/triggers/policies/indexes. Check the target Supabase Auth schema includes `email_confirmed_at`, `is_anonymous`, and `banned_until` (current standard Supabase fields).
- Confirm `profiles`, `trips`, `trip_participants` each have RLS enabled in `pg_class.relrowsecurity`. Review `pg_policies` for exactly this migration's policies and no unexpected permissive policies.
- Confirm `davis_private` is not in the Data API exposed-schema setting. Verify it is owned by a trusted migration role, not `anon`, `authenticated`, or a user-controlled role.
- Inspect actual ACLs, including inherited and default grants. `anon` must have no table access; `authenticated` must have SELECT but no table-wide INSERT/UPDATE, DELETE, TRUNCATE, or TRIGGER. Check column privileges too: authenticated cannot INSERT trip/request status, or UPDATE IDs, owners, request party size, or timestamps. Some writable columns are intentionally granted individually.
- Check `pg_proc.prosecdef` and `proconfig`: only the eligibility helper and participant trigger use SECURITY DEFINER; every function has `search_path=""`. Verify only authenticated can EXECUTE the boolean helper, not anon/PUBLIC/service_role; none of those roles can EXECUTE the three trigger functions. Database owners retain their trusted administrative rights.
- A trigger function's revoked client EXECUTE must not prevent its installed trigger from firing during normal authenticated writes. Test actual writes rather than granting EXECUTE to fix an unrelated error.

## 2. Create separate test identities

Use supported Supabase Auth tools to create test-only identities, not handcrafted production `auth.users` rows:

- A: confirmed `@ucdavis.edu` owner.
- B: confirmed `@ucdavis.edu` applicant.
- C: confirmed `@ucdavis.edu` unrelated user.
- U: unconfirmed university user; N: confirmed non-university user.
- An anonymous Auth user, an unauthenticated (`anon`) caller, and a currently banned university user.

Use actual authenticated sessions/API calls where possible. A truly unconfirmed identity may not be able to sign in; that is expected. For deliberate policy simulation, use a trusted SQL connection and transaction-local role/claims against existing disposable Auth identities. Example template (replace the UUID locally):

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"REPLACE_WITH_TEST_USER_UUID","role":"authenticated"}', true);
select auth.uid(); -- Must equal the chosen test identity.
-- Run ONE scenario here, verify rows/results, then discard it:
rollback;
```

Do not test only as the SQL Editor's default privileged role: it bypasses RLS. Never expose the ability to set JWT claims to an application user. Use a fresh transaction per failing scenario (an expected SQL error aborts its transaction); always issue ROLLBACK afterward. Some RLS-denied UPDATE/SELECT operations return zero rows instead of raising an error: verify stored data did not change.

## 3. Profiles and privacy

- A can create and edit only A's nickname/bio. A cannot supply B's profile ID, change an ID or write timestamps. Empty/spaces/tabs/newlines-only nicknames and nicknames over 30 stored characters fail.
- A's SELECT returns A's profile only; B/C/anon cannot read it, even knowing the UUID. Verify joins, REST selects and GraphQL (if enabled) do not expose profiles.
- There is no public nickname endpoint. Do not loosen profile SELECT or create an owner-rights view to make nicknames appear. Review the scoped future nickname design in README before implementing it.

## 4. Trips and eligibility

- A can create a valid future California-time trip with no owner/status/timestamp overrides; default owner is A and status is active. A can also explicitly provide A's owner ID.
- U/N/anonymous/banned users cannot create or join. Test non-university suffixes such as `person@ucdavis.edu.example.com` and forged profile/user metadata. Changing an Auth email/confirmation/ban state must affect later requests even with an older JWT; changes are evaluated using database statement snapshots, not as retroactive transaction revocation.
- B/C cannot change A's trip, reassign ownership, forge owners, modify timestamps or delete/truncate rows. A can edit only A's active future trip. Case/whitespace-equivalent endpoints, blank/oversized labels, infinite/out-of-range dates, 24:00, non-minute times, invalid counts/flexibility and inconsistent luggage fail.
- A cancels with only `status='cancelled'`: succeeds. Cancellation plus changed notes/route/date/count fails. Reopening/editing the cancelled trip fails. Nonowners lose access to closed trip details; A retains access.
- For a trip near departure, let the departure actually pass in this disposable environment. Rescheduling it into the future fails; verified A can mark it completed using status only. Completing a still-future trip or changing its date while completing it fails. Completed trips cannot reopen.
- After A loses university eligibility, A can still cancel their own active trip with status only; ordinary edits, creation, joins and completion fail. Auth account/session bans may separately prevent obtaining an API session, even though the cancellation policy provides a database-level ownership escape path.

## 5. Requests and state transitions

- B requests A's active future trip: defaults to pending and B's user ID. A cannot request A's own trip. B cannot submit C's ID or a party larger than the recruitment limit. Duplicate `(trip_id,user_id)` fails, including after rejection/withdrawal.
- Forged initial `approved`/`rejected`/`withdrawn` status fails at column privilege checks. Neither A nor B can update pending to approved, change trip/user/party size, or reset a terminal request. No approval RPC exists.
- Only B can withdraw B's pending request; only A can reject it. C cannot read or mutate it. Test both transitions using separate pending fixtures; terminal transitions cannot be repeated/reset.
- Cancel A's trip with an existing pending request. B still sees their request and may withdraw; A sees it and may reject. The record is not automatically deleted/rejected. New requests fail. Repeat for a completed trip after its departure.

## 6. Concurrent transactions (two independent sessions)

Use committed disposable fixture trips/users for these tests; transaction-local fixtures are invisible to the other session. Set role/claims independently in both sessions. Use reasonable local `lock_timeout` values to avoid leaving test sessions blocked indefinitely; timeout means retry the test, not success.

1. Session A updates its trip to cancelled and leaves the transaction open. Session B submits a join and waits for the parent lock. Commit A: B must fail, leaving no request. Repeat with completion of a departed trip, and with a capacity reduction below B's party size. Depending on isolation, a serialization failure is also a safe result; retry the entire transaction.
2. Reverse the order: B inserts a pending request and holds the transaction. A's cancellation must wait. Commit B, then commit A. Cancellation is allowed and the earlier pending request remains private history. This is intentional; cancellation does not erase requests.
3. Two B sessions insert the same request: only one can commit; the other fails the unique constraint. Rollbacks must release locks normally.
4. Multiple different applicants can submit pending requests above the combined recruitment limit. This is expected because pending requests do not reserve seats. Approval remains disabled until the atomic capacity RPC is implemented and concurrency-tested.

## 7. Finish safely

- Roll back all open test transactions and discard only the disposable environment through your normal test-project cleanup process. Do not issue blanket DELETE/DROP against the real project.
- Record actual PostgreSQL/Supabase versions, successful/failed cases, SQLSTATEs, affected-row counts and concurrency outcomes. Do not treat static review or application matching tests as proof of database/RLS correctness.
- Apply to the real empty project only after these checks pass. If the original migration was already applied, do not rerun this edited initial migration: create a separate forward migration instead.
