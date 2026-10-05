# Harbor catalog for SUSE Edge Rancher UI extensions (KubeVirt + Akri).
# Everything that needs Node runs in Docker — no host Node required.
SHELL := /bin/bash

PKG         := kubevirt-dashboard-extension
PKGS        := kubevirt-dashboard-extension akri-dashboard-extension
NODE_IMAGE  := node:20-bookworm
DOCKER_RUN  := docker run --rm -v "$(CURDIR)":/app -w /app

REGISTRY    ?= nova-harbor.mousquetaires.com/qe
VERSION     ?=
EXTRA_TAGS  ?=
IMAGE_NAME  ?= kubevirt-ui-plugin-catalog

.PHONY: help install publish catalog-build catalog-push clean

help:
	@grep -E '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | sed 's/:.*## /\t/' | expand -t22

install: ## Install dependencies (writes node_modules/ and yarn.lock)
	$(DOCKER_RUN) $(NODE_IMAGE) yarn install

publish: ## Build Helm charts + plugin bundles (no GitHub push)
	docker build -f Dockerfile.publish -t kubevirt-ext-publish .
	$(DOCKER_RUN) kubevirt-ext-publish yarn publish-pkgs -f $(PKGS)

catalog-build: ## Build Harbor catalog image (needs prior make publish)
	REGISTRY="$(REGISTRY)" IMAGE_NAME="$(IMAGE_NAME)" PKG="$(PKG)" \
	  VERSION="$(VERSION)" EXTRA_TAGS="$(EXTRA_TAGS)" \
	  ./scripts/catalog-build.sh

catalog-push: ## Build + push catalog image to Harbor
	REGISTRY="$(REGISTRY)" IMAGE_NAME="$(IMAGE_NAME)" PKG="$(PKG)" \
	  VERSION="$(VERSION)" EXTRA_TAGS="$(EXTRA_TAGS)" \
	  ./scripts/catalog-build.sh --push

clean: ## Remove build output
	rm -rf dist dist-pkg tmp charts extensions assets index.yaml
