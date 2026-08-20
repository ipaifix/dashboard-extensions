<script>
export default {
  name: 'KubevirtSnapshotDialog',

  props: {
    resources: {
      type:     Array,
      required: true,
    },
  },

  emits: ['close'],

  data() {
    const vm           = this.resources[0];
    const vmName       = vm?.metadata?.name || '';
    const snapshotName = `${ vmName }-snap-${ Date.now() }`;

    return {
      snapshotName,
      saving: false,
      error:  null,
    };
  },

  computed: {
    vm() {
      return this.resources[0];
    },
  },

  methods: {
    tt(key, params = {}, fallback = '') {
      return this.t(key, params, true) || fallback;
    },

    formatError(err, fallback) {
      const defaultFallback = this.tt(
        'kubevirt.modal.snapshot.createError',
        {},
        'Failed to create snapshot.'
      );

      return err?.data?.message || err?.message || fallback || defaultFallback;
    },

    close() {
      this.$emit('close');
    },

    async takeSnapshot() {
      this.saving = true;
      this.error  = null;

      const clusterId = this.$store.getters['clusterId'];
      const ns        = this.vm.metadata.namespace;
      const vmName    = this.vm.metadata.name;

      const body = {
        apiVersion: 'snapshot.kubevirt.io/v1beta1',
        kind:       'VirtualMachineSnapshot',
        metadata:   {
          name:      this.snapshotName,
          namespace: ns,
        },
        spec: {
          source: {
            apiGroup: 'kubevirt.io',
            kind:     'VirtualMachine',
            name:     vmName,
          },
        },
      };

      try {
        await this.$store.dispatch('cluster/request', {
          method: 'POST',
          url:    `/k8s/clusters/${ clusterId }/apis/snapshot.kubevirt.io/v1beta1/namespaces/${ ns }/virtualmachinesnapshots`,
          data:   body,
        });

        this.$store.dispatch('growl/success', {
          title:   this.tt('kubevirt.modal.snapshot.createdTitle', {}, 'Snapshot created'),
          message: this.tt(
            'kubevirt.modal.snapshot.created',
            { name: this.snapshotName },
            `Snapshot "${ this.snapshotName }" has been initiated.`
          ),
        }, { root: true });

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
  <div class="kv-snap-overlay" @click.self="close">
    <div class="kv-snap-dialog">
      <div class="kv-snap-header">
        <h4>
          {{ t('kubevirt.modal.snapshot.title', { name: vm.metadata.name }, true)
            || `Take Snapshot — ${ vm.metadata.name }` }}
        </h4>
        <button class="kv-close-btn" @click="close">
          <i class="icon icon-close" />
        </button>
      </div>

      <div class="kv-snap-body">
        <div v-if="error" class="banner banner-error mb-10">
          <i class="icon icon-warning mr-5" />{{ error }}
        </div>

        <div class="mb-10">
          <label class="kv-label">
            {{ t('kubevirt.modal.snapshot.nameLabel', {}, true) || 'Snapshot name' }}
          </label>
          <input
            v-model="snapshotName"
            type="text"
            class="kv-input"
            :placeholder="t('kubevirt.modal.snapshot.namePlaceholder', {}, true) || 'Snapshot name'"
          />
        </div>
      </div>

      <div class="kv-snap-footer">
        <button class="btn role-secondary" :disabled="saving" @click="close">
          {{ t('generic.cancel', {}, true) || 'Cancel' }}
        </button>
        <button
          class="btn role-primary ml-10"
          :disabled="saving || !snapshotName"
          @click="takeSnapshot"
        >
          <i v-if="saving" class="icon icon-spinner icon-spin mr-5" />
          {{ saving
            ? (t('kubevirt.modal.snapshot.saving', {}, true) || 'Saving…')
            : (t('kubevirt.action.takeSnapshot', {}, true) || 'Take Snapshot') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.kv-snap-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.kv-snap-dialog {
  background: var(--body-bg, #fff);
  border: 1px solid var(--border);
  border-radius: 6px;
  width: 440px;
  max-width: 95vw;
  display: flex;
  flex-direction: column;
}

.kv-snap-header {
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

.kv-snap-body {
  padding: 20px;
  flex: 1;
}

.kv-snap-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
}

.kv-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--input-label);
  margin-bottom: 6px;
}

.kv-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--body-text);
  font-size: 13px;

  &:focus {
    outline: none;
    border-color: var(--primary);
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
}
</style>
