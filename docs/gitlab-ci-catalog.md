# Guide GitLab CI — catalogue UI KubeVirt / Akri (novices)

Publier les extensions Rancher de ce dépôt comme **image catalogue** sur
Harbor, pour DEV / PREPROD / PROD.

Fichier CI : [`.gitlab-ci.yml`](../.gitlab-ci.yml)  
Compatibilité : [`COMPATIBILITY.md`](../COMPATIBILITY.md)

CI alignée sur **Kaniko** (comme `ztp-dashboard` / `ztp-operator`) : les
runners K8s partagés bloquent Buildah (`uid_map: operation not permitted`).

Le catalogue contient **kubevirt-dashboard-extension** et
**akri-dashboard-extension** (index multi-chart).

---

## En une phrase

| Action | Résultat |
|--------|----------|
| Merge Request / push | **Tests** unitaires KubeVirt |
| Push `develop` / `preprod` / `main` | Tests + **publish:pkgs** + **Kaniko** → Harbor |
| Tag Git `v1.4.0-rc.2` (ou `kubevirt-dashboard-extension-…`) | Idem + tags `:v…` et `:latest` |

Un tag Harbor = **un** snapshot catalogue (pas d’historique multi-versions
dans l’image). Le tag suit la version **kubevirt** dans
`pkg/kubevirt-dashboard-extension/package.json`.

Le CI **n’installe pas** l’extension dans Rancher. Tu enregistres le catalogue
dans l’UI Rancher (Extensions) une fois par environnement.

---

## Image produite

```text
nova-harbor.mousquetaires.com/qe/kubevirt-ui-plugin-catalog:<version>
```

Alias selon la branche :

| Branche / tag | Alias Harbor en plus |
|---------------|----------------------|
| `develop` | `:dev` |
| `preprod` | `:preprod` |
| `main` | `:latest` |
| tag `v1.4.0-rc.2` | `:v1.4.0-rc.2` + `:latest` |

Contenu : `index.yaml` + `charts/` + `extensions/` + `assets/` (KubeVirt +
Akri), servis par **busybox httpd** sur le port **8080**.

---

## Variables CI/CD (une fois)

**Settings → CI/CD → Variables**

| Variable | Obligatoire | Exemple |
|----------|-------------|---------|
| `HARBOR_USER` | oui (masked) | robot Harbor |
| `HARBOR_PASSWORD` | oui (masked) | token |
| `HARBOR_HOST` | non | `nova-harbor.mousquetaires.com` |
| `REGISTRY` | non | `nova-harbor.mousquetaires.com/qe` |

---

## Branches

```text
feature/* ──MR──► develop ──► preprod ──► main + tag
                    :dev       :preprod    :X.Y.Z / :latest
```

Avant de tagger : bump `version` dans
`pkg/kubevirt-dashboard-extension/package.json` (et Akri si besoin),
`make publish` en local pour vérifier, commit, tag aligné.

---

## Enregistrer le catalogue dans Rancher

1. **Extensions** → **Manage Extensions** → repositories / catalogs.
2. Ajouter l’image OCI, ex. :
   `nova-harbor.mousquetaires.com/qe/kubevirt-ui-plugin-catalog:1.4.0-rc.2`
   (ou `:dev` / `:preprod` selon l’env).
3. Installer / upgrader `kubevirt-dashboard-extension` (et Akri si voulu).
4. Vérifier la matrice [`COMPATIBILITY.md`](../COMPATIBILITY.md).

Le cluster Rancher doit pouvoir **pull** Harbor.

---

## Lab local

```bash
make publish
make catalog-push VERSION=1.4.0-rc.2 EXTRA_TAGS=dev
```

Les workflows `.github/` (GitHub Pages / GHCR) viennent du scaffold SUSE Edge
et **ne sont pas** le canal nominal ici (GitLab + Harbor).

---

## Échecs fréquents

| Symptôme | Correctif |
|----------|-----------|
| Kaniko `unauthorized` / push Harbor | Recréer `HARBOR_USER` / `HARBOR_PASSWORD` (masked) |
| `uid_map: operation not permitted` | Ancienne CI Buildah — utiliser Kaniko (ce YAML) |
| Tag Git ≠ `package.json` kubevirt | Aligner avant de pusher le tag |
| Plugin `Failed to cache` | Vérifier pull Harbor + version dans le catalogue |
