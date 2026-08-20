<script>
import vmActions from '../utils/vm-actions';

const {
  isSnapshotReady: checkSnapshotReady,
  getRestorePhase,
  getRestoreState: resolveRestoreState,
  getRestoreTimestamp,
  isRestoreInProgress,
} = vmActions;

export default {
  name: 'VMSnapshotsTab',

  props: {
    vm: {
      type:     Object,
      required: true,
    },
  },

  data() {
    return {
      snapshots:      [],
      allRestores:    [],
      error:          null,
      refreshTimer:   null,
      restoreTracker: {},
      isActive:       true,
    };
  },

  computed: {
    vmName() {
      return this.vm?.metadata?.name || '';
    },

    namespace() {
      return this.vm?.metadata?.namespace || '';
    },

    clusterId() {
      return this.$store.getters['clusterId']
        || this.$store.getters['currentCluster']?.id;
    },

    hasInProgress() {
      return this.snapshots.some((s) => !s.status?.readyToUse);
    },

    activeRestores() {
      return Object.values(this.restoreTracker).filter((entry) => !entry.done);
    },

    hasActiveRestores() {
      return this.activeRestores.length > 0;
    },

    hasRestoreInProgress() {
      return this.allRestores.some((r) => isRestoreInProgress(r)) || this.hasActiveRestores;
    },

    lastRestoreBySnapshot() {
      const map = {};

      for (const restore of this.allRestores) {
        const snapName = restore.spec?.virtualMachineSnapshotName;

        if (!snapName) continue;
        const existing = map[snapName];
        const existingTs = existing?.metadata?.creationTimestamp || '';
        const currentTs = restore.metadata?.creationTimestamp || '';

        if (!existing || currentTs > existingTs) {
          map[snapName] = restore;
        }
      }

      return map;
    },
  },

  mounted() {
    this.fetchSnapshots();
    this.fetchRestores();
  },

  beforeDestroy() {
    this.isActive = false;
    this.clearTimer();
  },

  methods: {
    tt(key, params = {}, fallback = '') {
      return this.t(key, params, true) || fallback;
    },

    isSnapshotReady(snapshot) {
      return checkSnapshotReady(snapshot);
    },

    clearTimer() {
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }
    },

    scheduleRefresh() {
      this.clearTimer();
      const interval = this.hasRestoreInProgress ? 5000 : (this.hasInProgress ? 10000 : 30000);

      this.refreshTimer = setTimeout(() => {
        this.fetchSnapshots();
        this.fetchRestores();
      }, interval);
    },

    async fetchSnapshots() {
      if (!this.clusterId || !this.namespace) {
        return;
      }

      try {
        const res = await this.$store.dispatch('cluster/request', {
          method: 'GET',
          url:    `/k8s/clusters/${ this.clusterId }/apis/snapshot.kubevirt.io/v1beta1/namespaces/${ this.namespace }/virtualmachinesnapshots`,
        });

        const items = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);

        this.snapshots = items.filter((s) => {
          const sourceName = s?.spec?.source?.name;

          return !!sourceName && sourceName === this.vmName;
        });
        this.error = null;
      } catch (err) {
        const status = err?.status || err?.response?.status;

        if (status === 404 || status === 403) {
          this.snapshots = [];
          this.error = this.tt(
            'kubevirt.virtualMachine.detail.snapshots.errors.apiUnavailable',
            {},
            'Snapshot API (snapshot.kubevirt.io/v1beta1) is not available on this cluster.'
          );
        } else {
          this.error = this.formatError(
            err,
            this.tt('kubevirt.virtualMachine.detail.snapshots.errors.fetchFailed', {}, 'Failed to fetch snapshots.')
          );
        }
      } finally {
        this.scheduleRefresh();
      }
    },

    async fetchRestores() {
      if (!this.clusterId || !this.namespace) {
        return;
      }

      try {
        const res = await this.$store.dispatch('cluster/request', {
          method: 'GET',
          url:    `/k8s/clusters/${ this.clusterId }/apis/snapshot.kubevirt.io/v1beta1/namespaces/${ this.namespace }/virtualmachinerestores`,
        });

        const items = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);

        this.allRestores = items.filter((r) => r.spec?.target?.name === this.vmName);
      } catch (err) {
        this.allRestores = [];
      }
    },

    relativeDate(dateStr) {
      if (!dateStr) return '';
      const diff = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diff / 60000);

      if (mins < 1) {
        return this.tt('kubevirt.virtualMachine.detail.snapshots.relative.justNow', {}, 'just now');
      }
      if (mins < 60) {
        return this.tt('kubevirt.virtualMachine.detail.snapshots.relative.minutesAgo', { mins }, `${ mins } min ago`);
      }
      const hrs = Math.floor(mins / 60);

      if (hrs < 24) {
        return this.tt('kubevirt.virtualMachine.detail.snapshots.relative.hoursAgo', { hrs }, `${ hrs } h ago`);
      }

      const days = Math.floor(hrs / 24);

      return this.tt('kubevirt.virtualMachine.detail.snapshots.relative.daysAgo', { days }, `${ days } d ago`);
    },

    lastRestoreStatus(snapshotName) {
      const tracker = this.restoreTracker[snapshotName];

      if (tracker && !tracker.done) {
        return {
          phase:    'InProgress',
          label:    this.tt('kubevirt.virtualMachine.detail.snapshots.states.restoring', {}, 'Restoring…'),
          cls:      'state-progress',
          spinning: true,
          date:     null,
        };
      }

      const restore = this.lastRestoreBySnapshot[snapshotName];

      if (!restore) return null;

      const phase = getRestorePhase(restore);
      const ts = getRestoreTimestamp(restore);

      if (phase === 'Complete') {
        return {
          phase:    'Complete',
          label:    this.tt('kubevirt.virtualMachine.detail.snapshots.states.complete', {}, 'Complete'),
          cls:      'state-ready',
          spinning: false,
          date:     this.relativeDate(ts),
        };
      }

      if (phase === 'Failed') {
        return {
          phase:    'Failed',
          label:    this.tt('kubevirt.virtualMachine.detail.snapshots.states.failed', {}, 'Failed'),
          cls:      'state-error',
          spinning: false,
          date:     this.relativeDate(ts),
        };
      }

      return {
        phase:    'InProgress',
        label:    this.tt('kubevirt.virtualMachine.detail.snapshots.states.inProgress', {}, 'In Progress'),
        cls:      'state-progress',
        spinning: true,
        date:     this.relativeDate(ts),
      };
    },

    async openSnapshotDialog() {
      try {
        const dispatchModal = typeof this.vm?.$dispatch === 'function'
          ? this.vm.$dispatch.bind(this.vm)
          : this.$store.dispatch.bind(this.$store);

        await dispatchModal('promptModal', {
          resources: [this.vm],
          component: 'KubevirtSnapshotDialog',
        });
      } catch (err) {
        this.$store.dispatch('growl/error', {
          title:   this.tt('kubevirt.virtualMachine.detail.snapshots.growl.dialogErrorTitle', {}, 'Snapshot dialog error'),
          message: this.formatError(
            err,
            this.tt('kubevirt.virtualMachine.detail.snapshots.errors.openDialog', {}, 'Failed to open the snapshot dialog.')
          ),
        }, { root: true });
      }

      setTimeout(() => this.fetchSnapshots(), 3000);
    },

    formatError(err, fallback) {
      const defaultFallback = this.tt(
        'kubevirt.virtualMachine.detail.snapshots.errors.unexpected',
        {},
        'An unexpected error occurred.'
      );

      return err?.data?.message || err?.message || fallback || defaultFallback;
    },

    getRestoreState(entry) {
      return resolveRestoreState(entry);
    },

    restoreLabel(entry) {
      if (!entry) {
        return this.tt('kubevirt.virtualMachine.detail.snapshots.restore', {}, 'Restore');
      }

      if (entry.done && entry.failed) {
        return this.tt('kubevirt.virtualMachine.detail.snapshots.labels.restoreFailed', {}, 'Restore failed');
      }

      if (entry.done) {
        return this.tt('kubevirt.virtualMachine.detail.snapshots.labels.restoreCompleted', {}, 'Restore completed');
      }

      if (entry.phase) {
        return this.tt(
          'kubevirt.virtualMachine.detail.snapshots.labels.restoringWithPhase',
          { phase: entry.phase },
          `Restoring (${ entry.phase })...`
        );
      }

      return this.tt('kubevirt.virtualMachine.detail.snapshots.restoring', {}, 'Restoring...');
    },

    isRestoreRunning(snapshotName) {
      const entry = this.restoreTracker[snapshotName];

      return !!entry && !entry.done;
    },

    restoreButtonTitle(snap) {
      if (!this.isSnapshotReady(snap)) {
        return this.tt('kubevirt.virtualMachine.detail.snapshots.restoreNotReady', {}, 'Snapshot not ready');
      }

      if (this.isRestoreRunning(snap.metadata.name)) {
        return this.tt('kubevirt.virtualMachine.detail.snapshots.restoreInProgress', {}, 'Restore in progress');
      }

      return this.tt('kubevirt.virtualMachine.detail.snapshots.restoreTitle', {}, 'Restore from this snapshot');
    },

    async pollRestoreStatus(snapshotName, restoreName) {
      const maxAttempts = 60;
      const trackFailedFallback = this.tt(
        'kubevirt.virtualMachine.detail.snapshots.errors.trackFailed',
        {},
        'Failed to track the restore in progress.'
      );

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (!this.isActive) {
          return;
        }

        try {
          const res = await this.$store.dispatch('cluster/request', {
            method: 'GET',
            url:    `/k8s/clusters/${ this.clusterId }/apis/snapshot.kubevirt.io/v1beta1/namespaces/${ this.namespace }/virtualmachinerestores`,
          });

          const items = Array.isArray(res?.items) ? res.items : [];
          const restore = items.find((item) => item?.metadata?.name === restoreName);

          if (restore) {
            const conditions = Array.isArray(restore.status?.conditions) ? restore.status.conditions : [];
            const failureCondition = conditions.find((c) => c?.type === 'Failure' && c?.status === 'True');
            const readyCondition = conditions.find((c) => c?.type === 'Ready');
            const phase = getRestorePhase(restore);
            const message = failureCondition?.message ||
              readyCondition?.message ||
              restore.status?.error?.message ||
              '';
            const state = this.getRestoreState({ phase });

            this.restoreTracker = { ...this.restoreTracker, [snapshotName]: {
              restoreName,
              snapshotName,
              phase,
              message,
              done: state.done,
              failed: state.failed,
            } };

            if (state.done) {
              if (state.failed) {
                this.$store.dispatch('growl/error', {
                  title:   this.tt('kubevirt.virtualMachine.detail.snapshots.growl.restoreFailedTitle', {}, 'Restore failed'),
                  message: message || this.tt(
                    'kubevirt.virtualMachine.detail.snapshots.growl.restoreFailed',
                    { name: snapshotName },
                    `Restore of snapshot "${ snapshotName }" failed.`
                  ),
                }, { root: true });
              } else {
                this.$store.dispatch('growl/success', {
                  title:   this.tt('kubevirt.virtualMachine.detail.snapshots.growl.restoreCompletedTitle', {}, 'Restore completed'),
                  message: message || this.tt(
                    'kubevirt.virtualMachine.detail.snapshots.growl.restoreCompleted',
                    { name: snapshotName },
                    `Restore of snapshot "${ snapshotName }" completed.`
                  ),
                }, { root: true });
              }

              await Promise.all([this.fetchSnapshots(), this.fetchRestores()]);

              return;
            }
          }
        } catch (err) {
          this.restoreTracker = { ...this.restoreTracker, [snapshotName]: {
            restoreName,
            snapshotName,
            phase: 'Error',
            message: this.formatError(err, trackFailedFallback),
            done: true,
            failed: true,
          } };

          this.$store.dispatch('growl/error', {
            title:   this.tt('kubevirt.virtualMachine.detail.snapshots.growl.trackErrorTitle', {}, 'Restore tracking error'),
            message: this.formatError(err, trackFailedFallback),
          }, { root: true });

          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      this.restoreTracker = { ...this.restoreTracker, [snapshotName]: {
        ...this.restoreTracker[snapshotName],
        done: true,
        failed: true,
        phase: 'Timeout',
        message: this.tt(
          'kubevirt.virtualMachine.detail.snapshots.errors.timeoutMessage',
          {},
          'Restore tracking timed out. Check the VirtualMachineRestore resource.'
        ),
      } };

      this.$store.dispatch('growl/error', {
        title:   this.tt('kubevirt.virtualMachine.detail.snapshots.growl.timeoutTitle', {}, 'Restore timeout'),
        message: this.tt(
          'kubevirt.virtualMachine.detail.snapshots.errors.timeoutGrowl',
          {},
          'Restore is taking longer than expected. Check the VirtualMachineRestore resource.'
        ),
      }, { root: true });
    },

    beginRestoreTracking(snapshotName, restoreName) {
      this.restoreTracker = {
        ...this.restoreTracker,
        [snapshotName]: {
          restoreName,
          snapshotName,
          phase:   'InProgress',
          message: this.tt(
            'kubevirt.virtualMachine.detail.snapshots.growl.restoreRequestSent',
            {},
            'Restore request sent.'
          ),
          done:   false,
          failed: false,
        },
      };

      this.pollRestoreStatus(snapshotName, restoreName);
      this.scheduleRefresh();
    },

    async restoreSnapshot(snapshot) {
      if (!this.clusterId) {
        this.$store.dispatch('growl/error', {
          title:   this.tt('kubevirt.virtualMachine.detail.snapshots.growl.restoreErrorTitle', {}, 'Restore error'),
          message: this.tt(
            'kubevirt.virtualMachine.detail.snapshots.errors.missingCluster',
            {},
            'Unable to determine the current cluster (missing clusterId).'
          ),
        }, { root: true });

        return;
      }

      const snapshotName = snapshot.metadata.name;

      try {
        const dispatchModal = typeof this.vm?.$dispatch === 'function'
          ? this.vm.$dispatch.bind(this.vm)
          : this.$store.dispatch.bind(this.$store);

        // PromptModal only forwards `resources` + `componentProps` to the dialog.
        // Top-level keys (snapshot, onRestoreStarted) are stored in modalData but not bound as Vue props.
        await dispatchModal('promptModal', {
          resources: [this.vm],
          component: 'KubevirtRestoreDialog',
          componentProps: {
            snapshot,
            onRestoreStarted: (restoreName) => this.beginRestoreTracking(snapshotName, restoreName),
          },
        });
      } catch (err) {
        this.$store.dispatch('growl/error', {
          title:   this.tt('kubevirt.virtualMachine.detail.snapshots.growl.restoreErrorTitle', {}, 'Restore error'),
          message: this.formatError(
            err,
            this.tt(
              'kubevirt.virtualMachine.detail.snapshots.errors.openRestoreDialog',
              {},
              'Failed to open the restore dialog.'
            )
          ),
        }, { root: true });
      }

      setTimeout(() => {
        this.fetchSnapshots();
        this.fetchRestores();
      }, 2000);
    },

    async deleteSnapshot(snapshot) {
      const name = snapshot.metadata.name;

      try {
        await this.$store.dispatch('cluster/request', {
          method: 'DELETE',
          url:    `/k8s/clusters/${ this.clusterId }/apis/snapshot.kubevirt.io/v1beta1/namespaces/${ this.namespace }/virtualmachinesnapshots/${ name }`,
        });

        this.$store.dispatch('growl/success', {
          title:   this.tt('kubevirt.virtualMachine.detail.snapshots.growl.snapshotDeletedTitle', {}, 'Snapshot deleted'),
          message: this.tt(
            'kubevirt.virtualMachine.detail.snapshots.growl.snapshotDeleted',
            { name },
            `Snapshot "${ name }" has been deleted.`
          ),
        }, { root: true });

        await this.fetchSnapshots();
      } catch (err) {
        this.$store.dispatch('growl/fromError', {
          title: this.tt('kubevirt.virtualMachine.detail.snapshots.growl.deleteErrorTitle', {}, 'Delete error'),
          err,
        }, { root: true });
      }
    },

    formatDate(dateStr) {
      if (!dateStr) return '—';

      return new Date(dateStr).toLocaleString();
    },

    snapshotState(snapshot) {
      if (this.isSnapshotReady(snapshot)) {
        return {
          label: this.tt('kubevirt.virtualMachine.detail.snapshots.states.ready', {}, 'Ready'),
          cls:   'state-ready',
        };
      }

      if (snapshot.status?.error) {
        return {
          label: this.tt('kubevirt.virtualMachine.detail.snapshots.states.error', {}, 'Error'),
          cls:   'state-error',
        };
      }

      return {
        label: this.tt('kubevirt.virtualMachine.detail.snapshots.states.inProgress', {}, 'In Progress'),
        cls:   'state-progress',
      };
    },
  },
};
</script>

<template>
  <div class="vm-snapshots-tab">
    <div class="snapshots-toolbar">
      <button type="button" class="btn role-primary" @click="openSnapshotDialog">
        <i class="icon icon-plus mr-5" />
        {{ t('kubevirt.action.takeSnapshot', {}, true) || 'Take Snapshot' }}
      </button>
    </div>

    <div v-if="error" class="banner banner-error mt-10">
      <i class="icon icon-warning mr-5" />{{ error }}
    </div>

    <div v-if="!snapshots.length && !error" class="snapshots-empty">
      {{ t('kubevirt.virtualMachine.detail.snapshots.empty', {}, true) || 'No snapshots found for this VM.' }}
    </div>

    <table v-if="snapshots.length" class="snapshots-table">
      <thead>
        <tr>
          <th>{{ t('kubevirt.virtualMachine.detail.snapshots.columns.name', {}, true) || 'Name' }}</th>
          <th>{{ t('kubevirt.virtualMachine.detail.snapshots.columns.state', {}, true) || 'State' }}</th>
          <th>{{ t('kubevirt.virtualMachine.detail.snapshots.columns.created', {}, true) || 'Created' }}</th>
          <th>{{ t('kubevirt.virtualMachine.detail.snapshots.columns.lastRestore', {}, true) || 'Last Restore' }}</th>
          <th>{{ t('kubevirt.virtualMachine.detail.snapshots.columns.actions', {}, true) || 'Actions' }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="snap in snapshots" :key="snap.metadata.name">
          <td>{{ snap.metadata.name }}</td>
          <td>
            <span :class="['state-badge', snapshotState(snap).cls]">
              <i v-if="!isSnapshotReady(snap) && !snap.status?.error" class="icon icon-spinner icon-spin mr-5" />
              {{ snapshotState(snap).label }}
            </span>
          </td>
          <td>{{ formatDate(snap.metadata.creationTimestamp) }}</td>
          <td>
            <template v-if="lastRestoreStatus(snap.metadata.name)">
              <span :class="['state-badge', lastRestoreStatus(snap.metadata.name).cls]">
                <i v-if="lastRestoreStatus(snap.metadata.name).spinning" class="icon icon-spinner icon-spin mr-5" />
                {{ lastRestoreStatus(snap.metadata.name).label }}
              </span>
              <span v-if="lastRestoreStatus(snap.metadata.name).date" class="text-muted ml-5 restore-date">
                {{ lastRestoreStatus(snap.metadata.name).date }}
              </span>
            </template>
            <span v-else class="text-muted">—</span>
          </td>
          <td class="actions-cell">
            <button
              type="button"
              class="btn btn-sm role-secondary mr-5"
              :disabled="!isSnapshotReady(snap) || isRestoreRunning(snap.metadata.name)"
              :title="restoreButtonTitle(snap)"
              @click="restoreSnapshot(snap)"
            >
              <i
                v-if="!isRestoreRunning(snap.metadata.name)"
                class="icon icon-revert mr-5"
              />
              <i v-else class="icon icon-spinner icon-spin mr-5" />
              {{ isRestoreRunning(snap.metadata.name)
                ? (t('kubevirt.virtualMachine.detail.snapshots.restoring', {}, true) || 'Restoring...')
                : (t('kubevirt.virtualMachine.detail.snapshots.restore', {}, true) || 'Restore') }}
            </button>
            <button
              type="button"
              class="btn btn-sm role-secondary btn-danger"
              :title="t('kubevirt.virtualMachine.detail.snapshots.deleteTitle', {}, true) || 'Delete this snapshot'"
              @click="deleteSnapshot(snap)"
            >
              <i class="icon icon-delete" />
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="hasActiveRestores" class="banner banner-info mt-10">
      <i class="icon icon-spinner icon-spin mr-5" />
      {{ t('kubevirt.virtualMachine.detail.snapshots.activeRestores', { count: activeRestores.length }, true)
        || `Restore in progress: ${ activeRestores.length } operation(s).` }}
    </div>
  </div>
</template>

<style lang="scss" scoped>
.vm-snapshots-tab {
  padding: 16px;
}

.snapshots-toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.snapshots-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--input-label);
  padding: 24px 0;
}

.snapshots-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th, td {
    text-align: left;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
  }

  th {
    font-weight: 600;
    color: var(--input-label);
    background: var(--sortable-table-header-bg, var(--nav-bg));
  }

  tr:hover td {
    background: var(--sortable-table-row-bg-alt, rgba(0, 0, 0, 0.02));
  }
}

.actions-cell {
  white-space: nowrap;
}

.state-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;

  &.state-ready {
    background: rgba(var(--success-rgb, 40, 167, 69), 0.15);
    color: var(--success);
  }

  &.state-progress {
    background: rgba(var(--warning-rgb, 255, 193, 7), 0.15);
    color: var(--warning);
  }

  &.state-error {
    background: rgba(var(--error-rgb, 200, 50, 50), 0.15);
    color: var(--error);
  }
}

.btn-danger {
  &:hover {
    border-color: var(--error);
    color: var(--error);
  }
}

.banner {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 4px;

  &.banner-error {
    background: rgba(200, 50, 50, 0.12);
    border: 1px solid var(--error);
    color: var(--error);
  }

  &.banner-info {
    background: rgba(var(--primary-rgb, 52, 152, 219), 0.12);
    border: 1px solid var(--primary);
    color: var(--primary);
  }
}

.text-muted {
  color: var(--input-label);
}

.restore-date {
  font-size: 11px;
}
</style>
