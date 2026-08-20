<script>
import { mapState } from 'vuex';

export default {
  name: 'KubevirtRestoreDialog',

  props: {
    resources: {
      type:     Array,
      required: true,
    },
    snapshot: {
      type:    Object,
      default: null,
    },
    /** Optional callback(restoreName) so the parent can track progress */
    onRestoreStarted: {
      type:    Function,
      default: null,
    },
  },

  emits: ['close'],

  data() {
    return {
      saving: false,
      error:  null,
    };
  },

  computed: {
    ...mapState('action-menu', ['modalData']),

    vm() {
      return this.resources?.[0] || null;
    },

    /** Prefer Vue props (via PromptModal componentProps); fall back to modalData for top-level payloads. */
    resolvedSnapshot() {
      return this.snapshot ||
        this.modalData?.componentProps?.snapshot ||
        this.modalData?.snapshot ||
        null;
    },

    resolvedOnRestoreStarted() {
      return this.onRestoreStarted ||
        this.modalData?.componentProps?.onRestoreStarted ||
        this.modalData?.onRestoreStarted ||
        null;
    },

    snapshotName() {
      return this.resolvedSnapshot?.metadata?.name || '';
    },

    vmName() {
      return this.vm?.metadata?.name || '';
    },

    namespace() {
      return this.vm?.metadata?.namespace || '';
    },

    clusterId() {
      return this.$store.getters['currentCluster']?.id
        || this.$store.getters['clusterId'];
    },

    isVmRunning() {
      const vm = this.vm;

      if (!vm) {
        return false;
      }

      if (vm.isRunning) {
        return true;
      }

      const printable = vm.status?.printableStatus;

      return ['Running', 'Starting', 'Migrating', 'Paused', 'Stopping'].includes(printable);
    },

    excludedVolumes() {
      const raw = this.resolvedSnapshot?.status?.excludedVolumes;

      if (!Array.isArray(raw) || !raw.length) {
        return [];
      }

      if (typeof raw[0] === 'string') {
        return raw;
      }

      return raw
        .map((v) => v?.volumeName || v?.name)
        .filter(Boolean);
    },

    showVolumesWarning() {
      return this.excludedVolumes.length > 0;
    },
  },

  methods: {
    tt(key, params = {}, fallback = '') {
      return this.t(key, params, true) || fallback;
    },

    formatError(err, fallback) {
      const defaultFallback = this.tt(
        'kubevirt.modal.restoreSnapshot.createError',
        {},
        'Failed to start restore.'
      );

      return err?.data?.message || err?.message || fallback || defaultFallback;
    },

    close() {
      this.$emit('close');
    },

    async stopVm() {
      if (typeof this.vm?.doVMSubresourceActionGrowl === 'function') {
        await this.vm.doVMSubresourceActionGrowl('virtualmachines', 'stop');

        return;
      }

      const url = `/k8s/clusters/${ this.clusterId }/apis/subresources.kubevirt.io/v1/namespaces/${ this.namespace }/virtualmachines/${ this.vmName }/stop`;

      await this.$store.dispatch('cluster/request', {
        headers: { accept: '*/*' },
        method:  'PUT',
        url,
        data:    {},
      });
    },

    async fetchVm() {
      const url = `/k8s/clusters/${ this.clusterId }/apis/kubevirt.io/v1/namespaces/${ this.namespace }/virtualmachines/${ this.vmName }`;

      return await this.$store.dispatch('cluster/request', {
        method: 'GET',
        url,
      });
    },

    isStillRunning(vm) {
      const printable = vm?.status?.printableStatus;

      return ['Running', 'Starting', 'Migrating', 'Paused', 'Stopping', 'WaitingForReceiver'].includes(printable);
    },

    async waitUntilStopped(timeoutMs = 180000) {
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        const vm = await this.fetchVm();

        if (!this.isStillRunning(vm)) {
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      throw new Error(this.tt(
        'kubevirt.modal.restoreSnapshot.stopTimeout',
        {},
        'Timed out waiting for the VM to stop before restore.'
      ));
    },

    async createRestore() {
      const restoreName = `${ this.vmName }-restore-${ Date.now() }`;
      const body = {
        apiVersion: 'snapshot.kubevirt.io/v1beta1',
        kind:       'VirtualMachineRestore',
        metadata:   {
          name:      restoreName,
          namespace: this.namespace,
        },
        spec: {
          target: {
            apiGroup: 'kubevirt.io',
            kind:     'VirtualMachine',
            name:     this.vmName,
          },
          virtualMachineSnapshotName: this.snapshotName,
          // Wait/stop target before restore. Do NOT use InPlace with Longhorn CSI
          // snapshots (type=snap): InPlace deletes the source volume and Longhorn
          // then fails to clone snap://<deleted-volume>/...
          targetReadinessPolicy: 'StopTarget',
        },
      };

      try {
        await this.$store.dispatch('cluster/request', {
          method: 'POST',
          url:    `/k8s/clusters/${ this.clusterId }/apis/snapshot.kubevirt.io/v1beta1/namespaces/${ this.namespace }/virtualmachinerestores`,
          data:   body,
        });
      } catch (err) {
        // Older clusters may not know targetReadinessPolicy — retry without it
        const msg = String(err?.data?.message || err?.message || '');

        if (!/unknown field|targetReadinessPolicy/i.test(msg)) {
          throw err;
        }

        delete body.spec.targetReadinessPolicy;

        await this.$store.dispatch('cluster/request', {
          method: 'POST',
          url:    `/k8s/clusters/${ this.clusterId }/apis/snapshot.kubevirt.io/v1beta1/namespaces/${ this.namespace }/virtualmachinerestores`,
          data:   body,
        });
      }

      return restoreName;
    },

    async confirm() {
      if (!this.snapshotName || !this.vmName || !this.clusterId) {
        this.error = this.tt(
          'kubevirt.modal.restoreSnapshot.missingContext',
          {},
          'Unable to restore: missing VM, snapshot, or cluster context.'
        );

        return;
      }

      this.saving = true;
      this.error = null;

      try {
        if (this.isVmRunning) {
          await this.stopVm();
          await this.waitUntilStopped();
        }

        const restoreName = await this.createRestore();

        this.$store.dispatch('growl/success', {
          title:   this.tt('kubevirt.modal.restoreSnapshot.initiatedTitle', {}, 'Restore initiated'),
          message: this.tt(
            'kubevirt.modal.restoreSnapshot.initiated',
            { name: this.snapshotName },
            `Restore from "${ this.snapshotName }" started.`
          ),
        }, { root: true });

        if (typeof this.resolvedOnRestoreStarted === 'function') {
          this.resolvedOnRestoreStarted(restoreName);
        }

        this.close();
      } catch (err) {
        this.error = this.formatError(err);
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<template>
  <div class="kv-restore-overlay" @click.self="close">
    <div class="kv-restore-dialog">
      <div class="kv-restore-header">
        <h4>
          {{ t('kubevirt.modal.restoreSnapshot.title', { name: vmName }, true)
            || `Restore Snapshot — ${ vmName }` }}
        </h4>
        <button type="button" class="kv-close-btn" @click="close">
          <i class="icon icon-close" />
        </button>
      </div>

      <div class="kv-restore-body">
        <div v-if="error" class="banner banner-error mb-10">
          <i class="icon icon-warning mr-5" />{{ error }}
        </div>

        <p class="kv-msg">
          {{ t('kubevirt.modal.restoreSnapshot.confirmMessage', { snapshot: snapshotName }, true)
            || `Restore VM from snapshot "${ snapshotName }"?` }}
        </p>

        <div v-if="showVolumesWarning" class="banner banner-warning mt-10">
          <i class="icon icon-warning mr-5" />
          {{ t(
            'kubevirt.modal.restoreSnapshot.volumesWarning',
            { volumes: excludedVolumes.join(', ') },
            true
          ) || `Warning: some volumes were excluded from this snapshot (${ excludedVolumes.join(', ') }). Disk data for those volumes will not be restored.` }}
        </div>

        <div v-if="isVmRunning" class="banner banner-warning mt-10">
          <i class="icon icon-warning mr-5" />
          {{ t('kubevirt.modal.restoreSnapshot.mustStop', {}, true)
            || 'The virtual machine must be stopped before restoring a snapshot.' }}
        </div>

        <p v-if="isVmRunning" class="kv-hint mt-10">
          {{ t('kubevirt.modal.restoreSnapshot.stopThenRestoreHint', {}, true)
            || 'Choose “Stop & Restore” to stop the VM and start the restore.' }}
        </p>
      </div>

      <div class="kv-restore-footer">
        <button type="button" class="btn role-secondary" :disabled="saving" @click="close">
          {{ t('generic.cancel', {}, true) || 'Cancel' }}
        </button>
        <button
          type="button"
          class="btn role-primary ml-10"
          :disabled="saving || !snapshotName"
          @click="confirm"
        >
          <i v-if="saving" class="icon icon-spinner icon-spin mr-5" />
          <template v-if="isVmRunning">
            {{ saving
              ? (t('kubevirt.modal.restoreSnapshot.stopping', {}, true) || 'Stopping & restoring…')
              : (t('kubevirt.modal.restoreSnapshot.stopAndRestore', {}, true) || 'Stop & Restore') }}
          </template>
          <template v-else>
            {{ saving
              ? (t('kubevirt.modal.restoreSnapshot.restoring', {}, true) || 'Restoring…')
              : (t('kubevirt.modal.restoreSnapshot.restore', {}, true) || 'Restore') }}
          </template>
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.kv-restore-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.kv-restore-dialog {
  background: var(--body-bg, #fff);
  border: 1px solid var(--border);
  border-radius: 6px;
  width: 480px;
  max-width: 95vw;
  display: flex;
  flex-direction: column;
}

.kv-restore-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);

  h4 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
}

.kv-close-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: var(--input-label);

  &:hover { color: var(--body-text); }
}

.kv-restore-body {
  padding: 20px;
  flex: 1;
}

.kv-msg {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
}

.kv-hint {
  margin: 0;
  font-size: 12px;
  color: var(--input-label);
  line-height: 1.4;
}

.kv-restore-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
}

.banner {
  display: flex;
  align-items: flex-start;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.4;

  &.banner-error {
    background: rgba(200, 50, 50, 0.12);
    border: 1px solid var(--error);
    color: var(--error);
  }

  &.banner-warning {
    background: rgba(var(--warning-rgb, 255, 193, 7), 0.15);
    border: 1px solid var(--warning);
    color: var(--body-text);
  }
}

.mb-10 { margin-bottom: 10px; }
.mt-10 { margin-top: 10px; }
.ml-10 { margin-left: 10px; }
.mr-5 { margin-right: 5px; }
</style>
