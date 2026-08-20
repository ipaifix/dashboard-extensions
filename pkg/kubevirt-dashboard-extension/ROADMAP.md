# KubeVirt Dashboard Extension — Roadmap & Release

**Version figée :** `1.4.0-rc.1`  
**Base upstream :** SUSE Edge KubeVirt extension `1.3.3`  
**Date de freeze :** 2026-08-20

Ce document fige le périmètre livré dans la RC, la roadmap restante, et la checklist pour sortir une release production.

---

## Contenu de la RC (`1.4.0-rc.1`)

| Domaine | Fonctionnalités |
|---|---|
| Vue détail | Onglets Overview, Disks, Networks, Console, Snapshots, Metrics, Logs |
| Actions VM | Start / Stop / Force Stop / Pause / Unpause / Soft Reboot |
| Migration | Live migrate, Abort, état Migrating |
| Snapshots | Take Snapshot, Restore (StopTarget, attente arrêt), état Restoring |
| Clone | VirtualMachineClone |
| Console | VNC + série, Ctrl+Alt+Del, reconnect, power button |
| Navigation | Listes Snapshots / Restores / Migrations |
| Observabilité | Métriques Prometheus, logs virt-launcher |

Hors périmètre RC (roadmap ci-dessous) : édition VM, gestion disques/NAD, hotplug, cloud-init, import/export, templates, formulaire de création.

---

## Roadmap

| Priorité | Fonctionnalité | Notes | État |
|---|---|---|---|
| P1 | Vue détail avec onglets | Socle UI | ✅ |
| P1 | Live Migration (+ Abort) | | ✅ |
| P1 | Métriques / monitoring | Onglet Metrics | ✅ |
| P2 | Snapshots / Restore | Incl. feedback Restoring | ✅ |
| P2 | Clone VM | | ✅ |
| — | Force Stop / Ctrl+Alt+Suppr / Logs | Demandes ops | ✅ |
| **P3** | **Édition VM** (spec existante) | Même socle formulaire que création, sans create | ⏳ |
| **P3** | **Gestion disques** (ajout / suppression) | Onglet actuellement lecture seule | ⏳ |
| **P3** | **Gestion NAD / réseau** | Onglet actuellement lecture seule | ⏳ |
| P4 | Hotplug NIC / Volume | | ⏳ |
| P4 | Éditeur cloud-init | | ⏳ |
| — | Import / Export VM | VirtualMachineExport + CDI | ⏳ |
| P5 | Templates (Instancetype) | | ⏳ |
| P5 | Formulaire **création** VM | Réutilise le formulaire d’édition ; reste P5 | ⏳ |

### Convention P3 vs P5

- **Édition** = modifier une VM existante (disques, NAD, ressources) → **P3**
- **Création** = wizard / formulaire new VM → **P5** (même si le formulaire est similaire)

---

## Sortie release production — prochaines étapes

### 1. Freeze technique (fait dans cette RC)

- [x] Bump version package → `1.4.0-rc.1`
- [x] Documenter roadmap + checklist (`ROADMAP.md`)
- [ ] Commit + tag git `kubevirt-dashboard-extension-1.4.0-rc.1` (ou convention repo)
- [ ] Build package d’extension (`yarn build-pkg kubevirt-dashboard-extension`)
- [ ] Publier / installer la RC sur un Rancher de staging

### 2. Vérifications automatisées

```bash
# Unit tests (helpers critiques : force-stop, migration, restore, logs)
cd pkg/kubevirt-dashboard-extension && yarn test:unit
# ou via Docker :
docker run --rm -v "$PWD/pkg/kubevirt-dashboard-extension:/app" -w /app node:20-alpine \
  node --test utils/vm-actions.test.js

# Build production de l’extension
yarn build-pkg kubevirt-dashboard-extension
```

- [ ] `node --test` : 0 fail
- [ ] `build-pkg` : artifact `.tgz` / chart généré sans erreur
- [ ] ESLint / Prettier sur les fichiers touchés (si branch CI active)
- [ ] Pas de secrets / kubeconfig / URL internes dans le package publié

### 3. Checklist manuelle (staging / PDV)

**Liste & détail**

- [ ] Liste VMs : état, IP, nœud, actions
- [ ] Détail : tous les onglets chargent sans erreur console
- [ ] État **Restoring** visible pendant un `VirtualMachineRestore` incomplet
- [ ] État **Migrating** + Abort

**Lifecycle**

- [ ] Start / Stop / Force Stop (VM stuck)
- [ ] Pause / Unpause / Soft Reboot
- [ ] Clone → nouvelle VM + PVC
- [ ] Snapshot → Ready
- [ ] Restore (VM arrêtée) → Complete → VM redémarre (Longhorn : attendre healthy)

**Console**

- [ ] VNC connect / disconnect / reconnect
- [ ] Ctrl+Alt+Del
- [ ] Série

**Observabilité**

- [ ] Metrics (Prometheus / ServiceMonitor présents)
- [ ] Logs (virt-launcher + fallback)

**Compat**

- [ ] Rancher ≥ 2.11, UI extensions 3.x
- [ ] KubeVirt avec feature gate Snapshot
- [ ] CSI snapshot (ex. Longhorn) pour clone / restore

### 4. Critères « prêt production »

La release `1.4.0` (hors RC) est OK si :

1. Build package reproductible et installable via Extensions catalog / chart
2. Tests unitaires verts
3. Checklist manuelle §3 validée sur au moins un cluster réel (RKE2 + KubeVirt + stockage snapshot)
4. Aucun bug bloquant ouvert sur Start/Stop/Migrate/Snapshot/Restore/Console
5. Version `package.json` = tag Git = artifact publié
6. Notes de release rédigées (breaking changes : aucune attendue vs 1.3.3 fonctionnel ; surface UI nettement élargie)

### 5. Publication `1.4.0`

1. Corriger les bugs RC remontés
2. Bump `1.4.0-rc.1` → `1.4.0` (pkg + root si applicable)
3. Tag Git + GitHub Release
4. Workflow `build-extension-charts` / catalog
5. Install prod + smoke test court (liste VM, détail, start/stop, une console)

---

## Hors scope volontaire (ne bloque pas `1.4.0`)

- Édition / création formulaire (P3/P5)
- Hotplug, cloud-init éditeur, Import/Export
- Couverture e2e Cypress complète
- i18n au-delà de `en-us` (sauf si exigence métier)

---

## Références

- Package : `pkg/kubevirt-dashboard-extension/package.json`
- Tests : `utils/vm-actions.test.js`
- Dev local : `docker-compose.dev.yml` (repo root)
- Upstream SUSE Edge : annotations Rancher dans `package.json`
