# Exemples Argo CD — catalogue UI KubeVirt / Akri

Exemples GitOps pour déployer le **catalogue Harbor** et les **UIPlugin**
`kubevirt-dashboard-extension` + `akri-dashboard-extension` sur le cluster
Rancher local.

Voir aussi le guide CI : [docs/gitlab-ci-catalog.md](../docs/gitlab-ci-catalog.md).

## Architecture

```text
Harbor OCI
  nova-harbor…/qe/kubevirt-ui-plugin-catalog:<tag>
        │
        ▼
  Deployment+Service (httpd)
  cattle-ui-plugin-system
        │
        ├── UIPlugin kubevirt-dashboard-extension
        └── UIPlugin akri-dashboard-extension
```

Le tag d’image suit la version **kubevirt** (`pkg/…/package.json`).

## Overlays

| Overlay | Image catalogue | Versions UIPlugin |
|---------|-----------------|-------------------|
| `overlays/dev` | `:dev` | kubevirt `1.4.0-rc.2`, akri `1.3.2` |
| `overlays/preprod` | `:preprod` | idem |
| `overlays/prod` | `:1.4.0-rc.2` | idem |

Ajuster les patches quand les versions package.json changent.

## Smoke test

```bash
kubectl apply -k deploy/argocd/overlays/dev
kubectl -n cattle-ui-plugin-system get deploy,svc,uiplugin
```

## Argo CD

Exemples : [`applications/`](applications/). Adapter `repoURL` / `destination` /
`project` avant apply.
