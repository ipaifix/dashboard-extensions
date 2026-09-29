<script>
import { NODE_SCHEDULABLE_LABEL } from '../constants';

export default {
  name: 'MigrateVMDialog',

  props: {
    vm: {
      type:     Object,
      required: true,
    },
    nodes: {
      type:    Array,
      default: () => [],
    },
  },

  emits: ['close'],

  data() {
    return {
      targetNode: '',
      loading:    false,
      error:      null,
    };
  },

  computed: {
    currentNode() {
      return this.vm.vmi?.status?.nodeName || null;
    },

    eligibleNodes() {
      return this.nodes.filter((n) => {
        if (n.metadata?.name === this.currentNode) return false;
        if (n.spec?.unschedulable) return false;
        if (n.metadata?.labels?.[NODE_SCHEDULABLE_LABEL] !== 'true') return false;

        const ready = (n.status?.conditions || []).find((c) => c.type === 'Ready');

        return ready?.status === 'True';
      });
    },

    namespace() {
      return this.vm.metadata?.namespace;
    },

    vmName() {
      return this.vm.metadata?.name;
    },

    clusterId() {
      return this.$store.getters['clusterId'];
    },
  },

  methods: {
    close() {
      this.$emit('close');
    },

    async migrate() {
      this.loading = true;
      this.error   = null;

      const migrationName = `${ this.vmName }-migration-${ Date.now() }`;
      const body = {
        apiVersion: 'kubevirt.io/v1',
        kind:       'VirtualMachineInstanceMigration',
        metadata:   {
          name:      migrationName,
          namespace: this.namespace,
        },
        spec: { vmiName: this.vmName },
      };

      try {
        await this.$store.dispatch('cluster/request', {
          method: 'POST',
          url:    `/k8s/clusters/${ this.clusterId }/apis/kubevirt.io/v1/namespaces/${ this.namespace }/virtualmachineinstancemigrations`,
          data:   body,
        });

        this.$store.dispatch('growl/success', {
          title:   this.t('generic.notification.title.succeed', {}, true),
          message: `Migration of ${ this.vmName } has been initiated.`,
        }, { root: true });

        this.close();
      } catch (err) {
        this.error = err?.data?.message || err?.message || 'Migration failed.';
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<template>
  <div class="migration-overlay" @click.self="close">
    <div class="migration-dialog">
      <div class="dialog-header">
        <h2>{{ t('kubevirt.modal.migration.title') }}</h2>
        <button class="btn-close" @click="close">
          <i class="icon icon-close" />
        </button>
      </div>

      <div class="dialog-body">
        <div v-if="currentNode" class="detail-row mb-15">
          <span class="label">Current node:</span>
          <span>{{ currentNode }}</span>
        </div>

        <div class="detail-row mb-20">
          <label class="label" for="target-node">
            {{ t('kubevirt.modal.migration.fields.nodeName.label') }}
          </label>
          <select id="target-node" v-model="targetNode" class="select-field">
            <option value="">
              {{ t('kubevirt.modal.migration.fields.nodeName.placeholder') }}
            </option>
            <option
              v-for="node in eligibleNodes"
              :key="node.metadata.name"
              :value="node.metadata.name"
            >
              {{ node.metadata.name }}
            </option>
          </select>
        </div>

        <div v-if="!eligibleNodes.length" class="text-warning mb-10">
          <i class="icon icon-warning mr-5" />
          No other schedulable nodes available.
        </div>

        <div v-if="error" class="text-error mb-10">
          <i class="icon icon-warning mr-5" />
          {{ error }}
        </div>
      </div>

      <div class="dialog-footer">
        <button class="btn role-secondary mr-10" :disabled="loading" @click="close">
          {{ t('generic.cancel') }}
        </button>
        <button
          class="btn role-primary"
          :disabled="loading || !eligibleNodes.length"
          @click="migrate"
        >
          <i v-if="loading" class="icon icon-spinner icon-spin mr-5" />
          {{ t('kubevirt.action.migrate') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.migration-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.migration-dialog {
  background: var(--body-bg, #fff);
  border: 1px solid var(--border);
  border-radius: 6px;
  width: 480px;
  max-width: 90vw;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);

  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
}

.btn-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--body-text);
  font-size: 18px;
  padding: 0;

  &:hover { color: var(--primary); }
}

.dialog-body {
  padding: 20px;
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
}

.detail-row {
  display: flex;
  align-items: center;

  .label {
    width: 140px;
    flex-shrink: 0;
    color: var(--input-label);
    font-weight: 500;
    font-size: 13px;
  }
}

.select-field {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--input-bg, #fff);
  color: var(--body-text);
  font-size: 13px;
}

.text-warning { color: var(--warning); font-size: 13px; }
.text-error   { color: var(--error);   font-size: 13px; }
</style>
