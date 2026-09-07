# BiteIQ K3s Operations

## Deploy

The base manifests intentionally omit the Secret resource so applying an
overlay cannot replace working values with blanks. Before deployment, create a
real Secret named `biteiq-secrets` in the `biteiq` namespace from
`deploy/k8s/base/secret.example.yaml`. Populate every key; do not commit the
resulting values. Set `DATABASE_URL` to the in-cluster PostgreSQL service, for example
`postgresql://<user>:<password>@biteiq-postgres:5432/<database>?sslmode=disable`.

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
NAMESPACE=biteiq
VALIDATION_POD=<disposable-postgres-pod>
VALIDATION_DATABASE=biteiq_restore_check
BACKUP_PATH=/secure/private/biteiq-YYYY-MM-DD.dump
CHECKSUM_PATH="${BACKUP_PATH}.sha256"
shasum -a 256 -c "$CHECKSUM_PATH"
kubectl -n "$NAMESPACE" cp "$BACKUP_PATH" "$VALIDATION_POD:/tmp/biteiq.dump"
kubectl -n "$NAMESPACE" exec "$VALIDATION_POD" -- createdb -U "$POSTGRES_USER" "$VALIDATION_DATABASE"
kubectl -n "$NAMESPACE" exec "$VALIDATION_POD" -- pg_restore -U "$POSTGRES_USER" -d "$VALIDATION_DATABASE" --clean --if-exists /tmp/biteiq.dump
```

After the disposable restore is checked, take the API offline, take a fresh
backup of the live database, and restore only with explicit live targets:

```sh
NAMESPACE=biteiq
POD=biteiq-postgres-0
DATABASE=biteiq
BACKUP_PATH=/secure/private/biteiq-YYYY-MM-DD.dump
kubectl -n "$NAMESPACE" scale deployment/biteiq-api --replicas=0
kubectl -n "$NAMESPACE" cp "$BACKUP_PATH" "$POD:/tmp/biteiq.dump"
kubectl -n "$NAMESPACE" exec "$POD" -- pg_restore -U "$POSTGRES_USER" -d "$DATABASE" --clean --if-exists /tmp/biteiq.dump
kubectl -n "$NAMESPACE" scale deployment/biteiq-api --replicas=2
```

Confirm the API rollout and readiness after recovery before allowing use.
If the restore command fails after the API was scaled down, immediately bring
the API back before investigating further:

```sh
kubectl -n "$NAMESPACE" scale deployment/biteiq-api --replicas=2
```
