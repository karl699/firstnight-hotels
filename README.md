# firstnight-hotels
Hotel search engine that prioritizes opening/renovation dates over star ratings

## Database migrations (Scalingo + PostgreSQL)

This repo uses `node-pg-migrate` to version and create the PostgreSQL schema.

### Local

- Set `DATABASE_URL` (e.g. `postgres://user:pass@localhost:5432/firstnight`).
- Run migrations:
  - `npm install`
  - `npm run migrate:up`

### Scalingo

- Ensure the app has a PostgreSQL addon attached (it provides `SCALINGO_POSTGRESQL_URL`).
- Set `DATABASE_URL` in the Scalingo environment so the migration tool can pick it up.
  - Recommended: set it to the same value as `SCALINGO_POSTGRESQL_URL`.
- On every deploy, Scalingo runs:
  - `postdeploy: npm run migrate:up` (see `Procfile`)

### Verify

- Check app logs to confirm the `postdeploy` hook succeeded.
- Call `GET /db-check` on the deployed app to verify DB connectivity.
