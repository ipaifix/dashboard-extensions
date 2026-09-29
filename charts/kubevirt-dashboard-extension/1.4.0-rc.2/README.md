# SUSE Edge: KubeVirt extension for Rancher Dashboard

An Edge focused extension for Rancher Dashboard allowing to monitor and interact virtual machine based workloads.

**Current freeze:** `1.4.0-rc.2` — see [ROADMAP.md](./ROADMAP.md) for shipped features, remaining priorities (P3 edit/disks/NAD … P5 create), and the production release checklist.

For more information on SUSE Edge see https://suse-edge.github.io/ \
For more information on Kubevirt see https://kubevirt.io/

## Unit tests (critical VM actions)

There is **no Jest/Vitest suite** wired for this package. Targeted anti-regression coverage for force-stop / migration / snapshot readiness / log source helpers lives in pure Node tests:

- Helpers: `utils/vm-actions.js`
- Specs: `utils/vm-actions.test.js` (Node built-in `node:test`, no extra deps)

### Run

From `dashboard-extensions/` (needs Node >= 20):

```bash
yarn test:unit
```

Without local Node (Docker only — does not touch `docker-compose.dev.yml`):

```bash
yarn test:unit:docker
```

Or from this package directory:

```bash
yarn test:unit
```
