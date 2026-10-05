<div align="center">

# SUSE Edge Rancher Dashboard extensions

<p align="center">
  <img alt="SUSE Logo" src="https://www.suse.com/assets/img/suse-black-logo-green.svg" height="140" />
  <h3 align="center">SUSE Edge Rancher Dashboard extensions</h3>
</p>

</div>

This repository contains a Rancher Dashboard skeleton application and hosts a set of extensions each living in it's respective directory under `pkg/`.

## Publishing — Harbor catalog (DEV / PREPROD / PROD)

Preferred path: build a **busybox httpd** OCI catalog and push it to Harbor
(KubeVirt + Akri charts in one image).

```bash
docker login nova-harbor.mousquetaires.com
make publish
make catalog-push VERSION=1.4.0-rc.2 EXTRA_TAGS=dev
# → nova-harbor.mousquetaires.com/qe/kubevirt-ui-plugin-catalog:1.4.0-rc.2 (+ :dev)
```

Then register that image as an Extensions catalog in Rancher.

GitLab CI (Kaniko) does the same on `develop` / `preprod` / `main` / tags —
guide: [`docs/gitlab-ci-catalog.md`](docs/gitlab-ci-catalog.md).

Argo CD examples (catalogue in-cluster + UIPlugins): [`deploy/argocd/`](deploy/argocd/).

Versions vs backends: [`COMPATIBILITY.md`](COMPATIBILITY.md).

The generated `.github/workflows` (GitHub Pages / GHCR) come from the SUSE Edge
scaffold and are **not** the nominal channel here.
