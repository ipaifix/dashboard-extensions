# Compatibilité kubevirt-dashboard ↔ backends

Les extensions de ce dépôt (`kubevirt-dashboard-extension`,
`akri-dashboard-extension`) ont des **versions indépendantes** des charts /
opérateurs cluster (KubeVirt, CDI, Akri, Harvester, …).

On ne synchronise une release UI avec un backend que lorsque le **contrat**
change (CRDs consommées, naming, actions UI qui cassent).

## Matrice

| Extension (chart / package) | Backend compatible | Notes |
|-----------------------------|--------------------|--------|
| `kubevirt-dashboard-extension` `1.4.x` | Rancher `>= 2.11`, UI extensions `>= 3.0.2 < 4.0.0`, KubeVirt CRDs VM / VMI / migrations / snapshots | Courant (`1.4.0-rc.2`) |
| `akri-dashboard-extension` `1.3.x` | Rancher `>= 2.11`, Akri CRDs Configuration / Instance | Courant (`1.3.2`) — publié dans le **même** catalogue Harbor |

Mettre à jour ce tableau à **chaque co-release** (changement de contrat).

## Quand release solo vs co-release

| Changement | Action |
|------------|--------|
| Fix / feature backend **sans** toucher CRDs ni contrat UI | Backend seul |
| Fix UI / i18n **sans** changer le YAML / CRDs consommés | Tag **extension seule** (bump `pkg/*/package.json`) |
| CRDs, champs, actions qui cassent l’UI | **Co-release** UI + backend ; maj de cette matrice |

## Catalogue Harbor

Une image `kubevirt-ui-plugin-catalog:<version>` embarque les charts publiés
du repo (KubeVirt + Akri). Le tag d’image suit la version **kubevirt**
(`pkg/kubevirt-dashboard-extension/package.json`). Un tag = un snapshot
(pas d’historique multi-versions dans l’image).
