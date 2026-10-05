#!/usr/bin/env bash
#
# Build (and optionally push) the Harbor extension-catalog image.
#
# Stages charts/ + extensions/ + assets/ into a temp context so Docker's
# root .dockerignore (which excludes those dirs for Dockerfile.publish) does
# not strip the catalog payload.
#
# Usage:
#   ./scripts/catalog-build.sh              # build only
#   ./scripts/catalog-build.sh --push       # build + push
#   REGISTRY=… VERSION=1.4.0-rc.2 ./scripts/catalog-build.sh --push
#
set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Primary package — drives default VERSION; catalog may contain more pkgs
PKG="${PKG:-kubevirt-dashboard-extension}"
REGISTRY="${REGISTRY:-nova-harbor.mousquetaires.com/qe}"
IMAGE_NAME="${IMAGE_NAME:-kubevirt-ui-plugin-catalog}"
# docker (local). GitLab CI builds via Kaniko — see .gitlab-ci.yml.
BUILDER="${BUILDER:-docker}"
PUSH=0

for arg in "$@"; do
  case "$arg" in
    --push) PUSH=1 ;;
    -h|--help)
      sed -n '2,14p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 1
      ;;
  esac
done

VERSION="${VERSION:-}"
if [ -z "${VERSION}" ]; then
  VERSION="$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "${BASE_DIR}/pkg/${PKG}/package.json" | head -1)"
fi
if [ -z "${VERSION}" ]; then
  echo "Cannot determine VERSION (set VERSION= or pkg/${PKG}/package.json)" >&2
  exit 1
fi

IMG="${REGISTRY}/${IMAGE_NAME}:${VERSION}"

need_dir() {
  if [ ! -d "$1" ]; then
    echo "Missing $1 — run 'make publish' first." >&2
    exit 1
  fi
}

need_dir "${BASE_DIR}/charts/${PKG}"
need_dir "${BASE_DIR}/extensions/${PKG}"
need_dir "${BASE_DIR}/assets"

# Prefer assets/index.yaml (multi-version); fall back to root index.yaml.
INDEX_SRC="${BASE_DIR}/assets/index.yaml"
if [ ! -f "${INDEX_SRC}" ]; then
  INDEX_SRC="${BASE_DIR}/index.yaml"
fi
if [ ! -f "${INDEX_SRC}" ]; then
  echo "Missing index.yaml (assets/ or repo root) — run 'make publish' first." >&2
  exit 1
fi

STAGE="$(mktemp -d "${TMPDIR:-/tmp}/kubevirt-catalog.XXXXXX")"
cleanup() { rm -rf "${STAGE}"; }
trap cleanup EXIT

echo "==> Staging catalog payload → ${STAGE}"
cp "${INDEX_SRC}" "${STAGE}/index.yaml"
cp -a "${BASE_DIR}/assets" "${STAGE}/assets"
cp -a "${BASE_DIR}/charts" "${STAGE}/charts"
cp -a "${BASE_DIR}/extensions" "${STAGE}/extensions"
cp "${BASE_DIR}/Dockerfile.catalog" "${STAGE}/Dockerfile.catalog"

echo "==> Building ${IMG} (builder=${BUILDER})"
case "${BUILDER}" in
  docker)
    docker build -f "${STAGE}/Dockerfile.catalog" -t "${IMG}" "${STAGE}"
    tag_alias() { docker tag "$1" "$2"; }
    push_img() { docker push "$1"; }
    ;;
  buildah)
    buildah bud \
      --storage-driver="${STORAGE_DRIVER:-vfs}" \
      -f "${STAGE}/Dockerfile.catalog" \
      -t "${IMG}" \
      "${STAGE}"
    tag_alias() { buildah tag "$1" "$2"; }
    push_img() { buildah push --storage-driver="${STORAGE_DRIVER:-vfs}" "$1"; }
    ;;
  *)
    echo "BUILDER must be docker or buildah (got: ${BUILDER})" >&2
    exit 1
    ;;
esac

if [ -n "${EXTRA_TAGS:-}" ]; then
  # shellcheck disable=SC2086
  for alias in ${EXTRA_TAGS}; do
    echo "==> Tag ${REGISTRY}/${IMAGE_NAME}:${alias}"
    tag_alias "${IMG}" "${REGISTRY}/${IMAGE_NAME}:${alias}"
  done
fi

if [ "${PUSH}" -eq 1 ]; then
  echo "==> Push ${IMG}"
  push_img "${IMG}"
  if [ -n "${EXTRA_TAGS:-}" ]; then
    # shellcheck disable=SC2086
    for alias in ${EXTRA_TAGS}; do
      push_img "${REGISTRY}/${IMAGE_NAME}:${alias}"
    done
  fi
fi

echo "==> Done: ${IMG}"
