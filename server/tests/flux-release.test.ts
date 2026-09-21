import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const require = createRequire(new URL("../../package.json", import.meta.url));
const yaml = require("js-yaml");
const root = fileURLToPath(new URL("../../", import.meta.url));
const render = (stage: string) => yaml.loadAll(execFileSync("kubectl", ["kustomize", `${root}deploy/k8s/homelab/${stage}`], { encoding: "utf8" }));

describe("Flux release contract", () => {
  test("renders disjoint stages without secrets, with persistent storage and matching migration/API images", () => {
    expect(existsSync(`${root}deploy/k8s/homelab/database/kustomization.yaml`)).toBe(true);
    const stages = [render("database"), render("migration"), render("app")];
    const identifiers = stages.flat().map((r: any) => `${r.kind}/${r.metadata.namespace ?? ""}/${r.metadata.name}`);
    expect(new Set(identifiers).size).toBe(identifiers.length);
    expect(stages.flat().some((r: any) => r.kind === "Secret")).toBe(false);
    expect(stages[0].find((r: any) => r.kind === "StatefulSet").spec.volumeClaimTemplates[0].spec.resources.requests.storage).toBe("10Gi");
    expect(stages[1]).toHaveLength(1);
    const job = stages[1][0];
    expect(job.kind).toBe("Job");
    expect(job.spec.ttlSecondsAfterFinished).toBeUndefined();
    expect(job.metadata.name).not.toBe("biteiq-migrate");
    const api = stages[2].find((r: any) => r.kind === "Deployment" && r.metadata.name === "biteiq-api");
    expect(api.spec.template.spec.containers[0].image).toBe(job.spec.template.spec.containers[0].image);
    expect(api.spec.template.spec.containers[0].image).toMatch(/^ghcr.io\/agustinkiko\/biteiq-api:main-[a-f0-9]{40}-\d+$/);
    const ingresses = stages[2].filter((r: any) => r.kind === "Ingress");
    expect(ingresses).toHaveLength(1);
    expect(ingresses[0].metadata.name).toBe("biteiq-api-http-redirect");
    const tunnel = stages[2].find((r: any) => r.kind === "IngressRoute");
    expect(tunnel?.spec.entryPoints).toEqual(["web"]);
    expect(tunnel.spec.routes.map((r: any) => r.services[0].name)).toEqual(["biteiq-api", "biteiq-web"]);
    for (const route of tunnel.spec.routes) {
      expect(route.match).toContain("Host(`biteiq.jericoagustin.com`)");
      expect(route.match).toContain("HeaderRegexp(`CF-Visitor`");
      expect(route.match).toContain('"https"');
      expect(route.middlewares).toBeUndefined();
    }
    expect(tunnel.spec.routes[0].priority).toBeGreaterThan(tunnel.spec.routes[1].priority);
    expect(tunnel.spec.routes[0].match).toContain("PathPrefix(`/api/`)");
    expect(stages[2].find((r: any) => r.kind === "Middleware").spec.redirectScheme.scheme).toBe("https");
    expect(stages[2].filter((r: any) => r.kind === "Service").every((r: any) => !r.spec.type || r.spec.type === "ClusterIP")).toBe(true);
    expect(stages.flat().filter((r: any) => r.kind !== "Namespace").every((r: any) => r.metadata.namespace === "biteiq")).toBe(true);
  });

  test("gates app release on the matching completed migration and database readiness", () => {
    expect(existsSync(`${root}deploy/flux/biteiq.yaml`)).toBe(true);
    const resources = yaml.loadAll(readFileSync(`${root}deploy/flux/biteiq.yaml`, "utf8"));
    const migration = resources.find((r: any) => r.kind === "Kustomization" && r.metadata.name.startsWith("biteiq-migration"));
    const app = resources.find((r: any) => r.kind === "Kustomization" && r.metadata.name === "biteiq-app");
    expect(migration.spec.dependsOn[0].name).toBe("biteiq-database");
    expect(migration.metadata.name).toBe("biteiq-migration-release-5");
    expect(app.spec.dependsOn[0].name).toBe(migration.metadata.name);
    const source = resources.find((r: any) => r.kind === "GitRepository");
    expect(source.metadata.name).toBe("biteiq-release-5");
    expect(source.spec.ref).toEqual({ tag: "biteiq-release-5" });
    expect(app.spec.sourceRef.name).toBe(source.metadata.name);
    expect(migration.spec.sourceRef.name).toBe(source.metadata.name);
    expect(app.metadata.labels["biteiq-release"]).toBe(migration.metadata.labels["biteiq-release"]);
    expect(app.spec.dependsOn[0].readyExpr).toContain("dep.metadata.labels['biteiq-release'] == self.metadata.labels['biteiq-release']");
    expect(app.spec.dependsOn[0].readyExpr).toContain("dep.metadata.generation == dep.status.observedGeneration");
    expect(app.spec.dependsOn[0].readyExpr).toContain("e.status == 'True'");
    expect(migration.spec.wait).toBe(true);
    expect(app.spec.wait).toBe(true);
    expect(resources.find((r: any) => r.kind === "Kustomization" && r.metadata.name === "biteiq-database").spec.prune).toBe(false);
  });
});
