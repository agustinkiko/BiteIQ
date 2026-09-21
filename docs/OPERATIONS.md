# BiteIQ K3s Operations

## Homelab Flux release

The live homelab target is `https://biteiq.jericoagustin.com`. The
`biteiq.home.arpa` files below remain generic private examples, not the selected
live hostname. Use the `deploy/k8s/homelab` stages for this release.

GitHub Actions publishes matching immutable API/web tags. `deploy/flux/biteiq.yaml`
is registered in the homelab GitOps repository, `clusters/homelab/biteiq.yaml`.
Flux reconciles database, migration, and app in that order. Secrets and TLS keys
are provisioned separately and are never stored in Git. Database pruning is
disabled so removing the Flux definition cannot prune the database workload.

Release image tag: `main-589fa8718294735aedc134308206b4aad57d5fe0-4`.
API digest: `sha256:591280c5ad85d90022be563e5dee39f33f2f7904da4dcf7e93522d5e33ba66ca`.
Web digest: `sha256:daeaf227419f989683010283114b3b51f64cfb4bf2ccb138bb4496f9811a3ea3`.

Before a later release, take and verify a database backup. Create a new immutable
Git release tag, a release-specific GitRepository, and a release-specific migration
Kustomization. Never move an existing release tag. Update both image tags and
the migration Job suffix in that release snapshot. In the GitOps registration,
update the app sourceRef and its migration dependency together. The current
release is pinned to Git tag `biteiq-release-4`; pushing to main does not change it.
The app dependency also checks the matching migration label and observed generation.
Do not enable independent API image automation before verifying this ordering
across updates. To roll back application code, revert the release tags in Git;
do not automatically reverse a schema migration or delete a PVC.

Inspect the actual homelab over SSH, not the local default Kubernetes context:

```sh
ssh homelab.jericoagustin.com 'kubectl -n flux-system get gitrepository biteiq-release-4; kubectl -n flux-system get kustomization biteiq-database biteiq-migration-release-4 biteiq-app; kubectl -n biteiq get pods,jobs,pvc,ingress'
```

Ready pods do not prove browser access. DNS, trusted HTTPS, private account
provisioning, USDA search, and persisted diary acceptance must also be verified.
Do not copy a local household database into the cluster without explicit approval.

## Deploy

The workload set includes a static Expo web frontend, Fastify API, and private
PostgreSQL. The Ingress routes `/api` to `biteiq-api` and `/` to `biteiq-web`.
Build `deploy/web.Dockerfile` from the repository root with
`--build-arg EXPO_PUBLIC_API_URL=https://biteiq.home.arpa/api` (replace the origin
consistently if using another hostname). The build deliberately disables dotenv
loading and development previews. Server secrets must never become web build
arguments. `.dockerignore` excludes local credentials, dependency directories,
database dumps, and screenshot artifacts.

Set a real immutable web image tag as well as the API/migration image tags in
the selected overlay. The example image names remain placeholders and are not
a deployed release. Build images for the target node architecture. Do not
disable TLS verification if the build environment lacks a trusted network CA;
use an approved build runner or explicitly supplied trusted CA instead.

The base manifests intentionally omit the Secret resource so applying an
overlay cannot replace working values with blanks. Before deployment, create a
real Secret named `biteiq-secrets` in the `biteiq` namespace from
`deploy/k8s/base/secret.example.yaml`. Populate every key; do not commit the
resulting values. Set `DATABASE_URL` to the in-cluster PostgreSQL service, for example
`postgresql://<user>:<password>@biteiq-postgres:5432/<database>?sslmode=disable`.

The checked-in private example sets both `APP_URL` and `CLIENT_ORIGINS` to
`https://biteiq.home.arpa`. These values are required by the production API and
match the example Ingress and TLS certificate. If you use another hostname,
patch every matching ConfigMap, Ingress, redirect, and TLS host together before
deployment. Never apply an empty value; the API rejects it at startup.

Set the API image name and tag in both
`deploy/k8s/example/kustomization.yaml` and
`deploy/k8s/example/migration/kustomization.yaml`. Before applying anything,
create the TLS Secret named `biteiq-home-arpa-tls` in namespace `biteiq`. It
must contain the `tls.crt` and `tls.key` for `biteiq.home.arpa`. The checked-in
example uses K3s Traefik: `websecure` serves TLS, and its `web` entrypoint
redirects to HTTPS through the included Traefik Middleware.

Use this release sequence. It recreates only the short-lived migration Job so
an image change never tries to mutate the Job pod template. It waits for the
migration before applying or rolling the API deployment; it does not delete the
PostgreSQL StatefulSet, claim, Service, ConfigMap, or Secret:

```sh
NAMESPACE=biteiq
kubectl apply -f deploy/k8s/base/namespace.yaml
kubectl -n "$NAMESPACE" apply -f deploy/k8s/base/api-config.yaml -f deploy/k8s/base/postgres-service.yaml -f deploy/k8s/base/postgres-statefulset.yaml
kubectl -n "$NAMESPACE" rollout status statefulset/biteiq-postgres --timeout=5m
kubectl -n "$NAMESPACE" delete job/biteiq-migrate --ignore-not-found
kubectl apply -k deploy/k8s/example/migration
kubectl -n biteiq wait --for=condition=complete job/biteiq-migrate --timeout=5m
kubectl apply -k deploy/k8s/example
kubectl -n biteiq rollout status deployment/biteiq-api --timeout=5m
```

The base ConfigMap contains the same valid `biteiq.home.arpa` production URLs
as the example overlay, so the release sequence never rolls an API pod with the
blank configuration that `loadConfig` rejects. Render and inspect the final
overlay before applying it:

```sh
kubectl kustomize deploy/k8s/example > /tmp/biteiq-rendered.yaml
kubectl apply --dry-run=server -f /tmp/biteiq-rendered.yaml
```

The example hostname, `biteiq.home.arpa`, is for a private LAN/VPN resolver
only. Replace it in a private overlay for another environment. TLS must be
provided by the private ingress controller before use. PostgreSQL has no
Ingress and remains reachable only inside the cluster.

## Backup

Choose explicit values before running the commands:

```sh
NAMESPACE=biteiq
POD=biteiq-postgres-0
DATABASE=biteiq
BACKUP_PATH=/secure/private/biteiq-$(date +%F).dump
CHECKSUM_PATH="${BACKUP_PATH}.sha256"
```

Write a custom-format dump, checksum it, then move both files to encrypted
private storage:

```sh
kubectl -n "$NAMESPACE" exec "$POD" -- pg_dump -U "$POSTGRES_USER" -Fc "$DATABASE" > "$BACKUP_PATH"
shasum -a 256 "$BACKUP_PATH" > "$CHECKSUM_PATH"
shasum -a 256 -c "$CHECKSUM_PATH"
```

Export `POSTGRES_USER` in the shell from the separately managed Secret before
the dump; do not put it in shell history. Retain the checksum with the encrypted
backup. A successful copy alone is not a verified backup.

## Restore validation and recovery

First restore into a disposable PostgreSQL instance and verify the checksum and
application tables there. Never start with the live database:

```sh
(
set -eu
NAMESPACE=biteiq
VALIDATION_POD=<disposable-postgres-pod>
VALIDATION_DATABASE=biteiq_restore_check
BACKUP_PATH=/secure/private/biteiq-YYYY-MM-DD.dump
CHECKSUM_PATH="${BACKUP_PATH}.sha256"
shasum -a 256 -c "$CHECKSUM_PATH"
kubectl -n "$NAMESPACE" cp "$BACKUP_PATH" "$VALIDATION_POD:/tmp/biteiq.dump"
kubectl -n "$NAMESPACE" exec "$VALIDATION_POD" -- createdb -U "$POSTGRES_USER" "$VALIDATION_DATABASE"
kubectl -n "$NAMESPACE" exec "$VALIDATION_POD" -- pg_restore -U "$POSTGRES_USER" -d "$VALIDATION_DATABASE" --exit-on-error --single-transaction /tmp/biteiq.dump
kubectl -n "$NAMESPACE" exec "$VALIDATION_POD" -- psql -U "$POSTGRES_USER" -d "$VALIDATION_DATABASE" -v ON_ERROR_STOP=1 -Atc "DO \$verify\$ BEGIN IF to_regclass('public.user_profiles') IS NULL OR to_regclass('public.foods') IS NULL OR to_regclass('public.food_entries') IS NULL THEN RAISE EXCEPTION 'BiteIQ restore verification failed: required tables are missing'; END IF; END \$verify\$;"
)
```

After the disposable restore is checked, take the API offline and wait for its
pods to stop. Then take and verify a fresh pre-restore backup. The live restore
uses one PostgreSQL transaction and stops on the first error, so a failed
restore cannot commit a partially restored database:

```sh
(
set -eu
NAMESPACE=biteiq
POD=biteiq-postgres-0
DATABASE=biteiq
BACKUP_PATH=/secure/private/biteiq-YYYY-MM-DD.dump
CHECKSUM_PATH="${BACKUP_PATH}.sha256"
PRE_RESTORE_BACKUP_PATH=/secure/private/biteiq-pre-restore-$(date +%F-%H%M%S).dump
PRE_RESTORE_CHECKSUM_PATH="${PRE_RESTORE_BACKUP_PATH}.sha256"
kubectl -n "$NAMESPACE" scale deployment/biteiq-api --replicas=0
kubectl -n "$NAMESPACE" rollout status deployment/biteiq-api --timeout=2m
kubectl -n "$NAMESPACE" exec "$POD" -- pg_dump -U "$POSTGRES_USER" -Fc "$DATABASE" > "$PRE_RESTORE_BACKUP_PATH"
shasum -a 256 "$PRE_RESTORE_BACKUP_PATH" > "$PRE_RESTORE_CHECKSUM_PATH"
shasum -a 256 -c "$PRE_RESTORE_CHECKSUM_PATH"
shasum -a 256 -c "$CHECKSUM_PATH"
kubectl -n "$NAMESPACE" cp "$BACKUP_PATH" "$POD:/tmp/biteiq.dump"
kubectl -n "$NAMESPACE" exec "$POD" -- pg_restore -U "$POSTGRES_USER" -d "$DATABASE" --clean --if-exists --exit-on-error --single-transaction /tmp/biteiq.dump
kubectl -n "$NAMESPACE" exec "$POD" -- psql -U "$POSTGRES_USER" -d "$DATABASE" -v ON_ERROR_STOP=1 -Atc "DO \$verify\$ BEGIN IF to_regclass('public.user_profiles') IS NULL OR to_regclass('public.foods') IS NULL OR to_regclass('public.food_entries') IS NULL THEN RAISE EXCEPTION 'BiteIQ restore verification failed: required tables are missing'; END IF; END \$verify\$;"
)
```

The subshell stops on the first error without exiting the operator's shell. Do
not scale the API up unless that entire block exits successfully. Only after it
does, bring the API online and confirm `/api/health/ready` through the private
HTTPS endpoint before allowing use:

```sh
NAMESPACE=biteiq
kubectl -n "$NAMESPACE" scale deployment/biteiq-api --replicas=2
kubectl -n "$NAMESPACE" rollout status deployment/biteiq-api --timeout=5m
```

If any live restore or verification command fails, stop and keep the API at
zero replicas. Roll back from the verified pre-restore backup, verify the
database again, and only then scale the API back up:

```sh
(
set -eu
NAMESPACE=biteiq
POD=biteiq-postgres-0
DATABASE=biteiq
PRE_RESTORE_BACKUP_PATH=/secure/private/biteiq-pre-restore-YYYY-MM-DD-HHMMSS.dump
PRE_RESTORE_CHECKSUM_PATH="${PRE_RESTORE_BACKUP_PATH}.sha256"
shasum -a 256 -c "$PRE_RESTORE_CHECKSUM_PATH"
kubectl -n "$NAMESPACE" cp "$PRE_RESTORE_BACKUP_PATH" "$POD:/tmp/biteiq-pre-restore.dump"
kubectl -n "$NAMESPACE" exec "$POD" -- pg_restore -U "$POSTGRES_USER" -d "$DATABASE" --clean --if-exists --exit-on-error --single-transaction /tmp/biteiq-pre-restore.dump
kubectl -n "$NAMESPACE" exec "$POD" -- psql -U "$POSTGRES_USER" -d "$DATABASE" -v ON_ERROR_STOP=1 -Atc "DO \$verify\$ BEGIN IF to_regclass('public.user_profiles') IS NULL OR to_regclass('public.foods') IS NULL OR to_regclass('public.food_entries') IS NULL THEN RAISE EXCEPTION 'BiteIQ restore verification failed: required tables are missing'; END IF; END \$verify\$;"
)
```

If rollback or its verification fails, leave the API offline. Preserve both
backup files and investigate before retrying. If the rollback block succeeds,
use the separate scale-up commands above. Never expose a database in a
partially restored or unverified state.
