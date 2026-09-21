# BiteIQ

BiteIQ is a private, self-hosted food diary for exactly two independent private people. Each person has an isolated account, profile, goal, and diary. The current foundation slice is an Expo client backed by Fastify and PostgreSQL. It supports private email/password sign-in, profile and goal persistence, canonical food search, and server-owned diary APIs. See [the API reference](docs/API.md) and [nutrition-data policy](docs/NUTRITION_DATA.md).

The server diary, limited offline new-entry queue, sign-out, and account-owned cache cleanup are implemented. The [2026-09-19 end-to-end report](dogfood-output/2026-09-19/report.md) records 315 automated tests, real browser flows, 30 live USDA source comparisons, and API/database-restart persistence. This run used the native API with Docker PostgreSQL because the development API container's dependency installation failed. Device, container startup, live K3s, and restore acceptance remain separate gates.

AI capture, barcode, label, voice, fasting, subscriptions, planning, and the legacy bundled-food path are development previews only. They are not supported production flows.

## Prerequisites

- Node.js 22
- npm
- Docker Desktop with Compose
- Expo Go for a device run, or a browser for Expo web
- `kubectl` only for private K3s deployment and recovery work

## Local setup

1. Install dependencies.

   ```sh
   npm install
   npm --prefix server install
   ```

2. Copy `.env.example` to a private `.env`. Generate a unique `AUTH_SECRET` of at least 32 characters for production. Set `EXPO_PUBLIC_API_URL` to the API base with `/api`; a phone must use the operator's LAN address, not `localhost`.

3. Start local PostgreSQL and the development API.

   ```sh
   docker compose -f deploy/compose.yaml up -d
   ```

4. Apply migrations.

   ```sh
   set -a
   source .env
   set +a
   npm --prefix server run db:migrate
   ```

5. Create each private account from an interactive terminal. The command prompts twice for a password and refuses password command-line arguments.

   ```sh
   set -a
   source .env
   set +a
   npm --prefix server run account:create -- --email operator-supplied@example.test --name 'Private User'
   ```

   Reset a password—and revoke active sessions—with:

   ```sh
   set -a
   source .env
   set +a
   npm --prefix server run account:reset-password -- --email operator-supplied@example.test
   ```

6. Start Expo in another terminal.

   ```sh
   set -a
   source .env
   set +a
   npm start
   ```

## Checks and builds

Health proves only the API process and PostgreSQL dependency:

```sh
curl http://127.0.0.1:4000/api/health/live
curl http://127.0.0.1:4000/api/health/ready
```

Run the client checks:

```sh
npm run test:client
npm run typecheck
npm run lint
npx expo export --platform web
```

Run the server checks. Integration tests use the guarded local test database and must not point at personal or live data:

```sh
npm --prefix server test
npm --prefix server run test:integration
npm --prefix server run typecheck
npm --prefix server run lint
npm --prefix server run build
```

Build the production API image:

```sh
docker build -f server/Dockerfile -t biteiq-api:verify .
```

See the [latest end-to-end evidence](dogfood-output/2026-09-19/report.md), [feature coverage and missing work](docs/e2e-feature-matrix.md), and [earlier implementation checklist](docs/IMPLEMENTATION_CHECKLIST.md). Passing the supported diary workflow does not complete the full original specification.

## Private K3s and recovery

`deploy/k8s/base` defines the private API, migration Job, PostgreSQL StatefulSet and ClusterIP services. `deploy/k8s/example` is a private LAN/VPN example with `biteiq.home.arpa` and Traefik TLS redirect. PostgreSQL has no Ingress.

Before deployment, create the separately managed `biteiq-secrets` Secret from `deploy/k8s/base/secret.example.yaml`, set image tags in both example Kustomizations, and create the TLS Secret. Use the migration-first release sequence in [K3s operations](docs/OPERATIONS.md). The manifests render locally, but no live K3s deployment is recorded.

Backups are PostgreSQL custom-format dumps with SHA-256 verification and encrypted private storage. Restore first into a disposable PostgreSQL instance; only then take the API offline, take a fresh backup, and run the explicit `pg_restore --clean --if-exists` recovery command. [K3s operations](docs/OPERATIONS.md) has the exact safe commands and recovery scale-up step. A copied dump is not a verified backup.

## Security boundary

Public sign-up is disabled. Account creation and password reset run only through interactive operator commands. Protected routes derive ownership from the session and return neutral not-found responses for another user's diary entry.

Keep `AUTH_SECRET`, `DATABASE_URL`, `USDA_FDC_API_KEY`, cookies, and passwords out of Git, Expo public variables, browser bundles, screenshots, and logs. The historical source includes development-only code outside the foundation path; a source scan alone is not secret-boundary proof.
