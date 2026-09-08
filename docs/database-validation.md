# Database release gate

Penpal pins the Supabase CLI used by validation to **2.116.0**. The wrapper in
`scripts/supabase-cli.mjs` always invokes that exact version through `pnpm dlx`,
so contributors and CI run the same CLI without installing a global binary or
writing credentials to the repository.

## Local checks

The static migration check does not connect to a database:

```sh
pnpm schema:check
```

It validates the required 14-digit migration version/name format, duplicate
versions, and deterministic version ordering. To compare the migration files
with the applied history, start the existing local Supabase instance (do not
reset or reseed it) and run:

```sh
pnpm schema:check:local
```

The local parity check uses `supabase migration list --local --output-format
json` and fails when a migration is pending, missing from history, or differs
between the files and the database history.

Schema lint is available as:

```sh
pnpm schema:lint
```

This runs `supabase db lint --local --fail-on error`. Findings at warning/INFO
level remain printed for review; intentional warnings do not fail the gate.
With the local database running, `pnpm schema:verify` runs both the parity check
and schema lint in sequence.

## CI/release check

`.github/workflows/database-release-gate.yml` runs for pull requests and pushes
to `main` when database or validation tooling changes. It:

1. installs dependencies from the frozen lockfile;
2. checks migration filenames/order;
3. starts a clean local Supabase instance, which applies migrations and fails on
   any migration error;
4. applies any pending migrations incrementally with `migration up --local`;
5. runs schema lint; and
6. verifies local migration-history parity.

The workflow never runs `supabase db reset`, `supabase db push`, or a seed
command. A production release should run the same checks before its normal
deployment/migration step; linking to a hosted project is intentionally left
to the deployment environment and its protected credentials.
