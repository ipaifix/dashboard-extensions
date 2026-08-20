<script>
import { NODE } from '@shell/config/types';

export default {
  name: 'KubevirtMigrateDialog',

  props: {
    resources: {
      type:     Array,
      required: true,
    },
  },

  emits: ['close'],

  data() {
    return {
      nodes:           [],
      selectedNode:    '',
      loading:         true,
      migrating:       false,
      error:           null,
    };
  },

  async mounted() {
    try {
      this.nodes = await this.$store.dispatch('cluster/findAll', { type: NODE });
    } catch (e) {
      this.error = e?.message || String(e);
    } finally {
      this.loading = false;
    }
  },

  computed: {
    vm() {
      return this.resources[0];
    },

    currentNode() {
      return this.vm?.vmi?.status?.nodeName || null;
    },

    schedulableNodes() {
      return (this.nodes || []).filter((n) => {
        if (n.spec?.unschedulable) return false;
        const ready = (n.status?.conditions || []).find((c) => c.type === 'Ready');

        if (!ready || ready.status !== 'True') return false;

        return n.metadata?.name !== this.currentNode;
      });
    },

    nodeOptions() {
      return [
        { label: 'Any available node', value: '' },
        ...this.schedulableNodes.map((n) => ({ label: n.metadata.name, value: n.metadata.name })),
      ];
    },
  },

  methods: {
    close() {
      this.$emit('close');
    },

    async migrate() {
      this.migrating = true;
      this.error = null;

      const clusterId = this.$store.getters['clusterId'];
      const ns        = this.vm.metadata.namespace;
      const vmName    = this.vm.metadata.name;

      const body = {
        apiVersion: 'kubevirt.io/v1',
        kind:       'VirtualMachineInstanceMigration',
        metadata:   {
          name:      `${ vmName }-migration-${ Date.now() }`,
          namespace: ns,
        },
        spec: { vmiName: vmName },
      };

      try {
        await this.$store.dispatch('cluster/request', {
          method: 'POST',
          url:    `/k8s/clusters/${ clusterId }/apis/kubevirt.io/v1/namespaces/${ ns }/virtualmachineinstancemigrations`,
          data:   body,
        });

        const vm = this.resources[0];

        vm._migrationInitiated = Date.now();

        this.$store.dispatch('growl/success', {
          title:   'Migration started',
          message: `Migration of ${ vmName } has been initiated.`,
        }, { root: true });

        this.close();
      } catch (err) {
        this.error = err?.data?.message || err?.message || String(err);
      } finally {
        this.migrating = false;
      }
    },
  },
};
</script>

<template>
  <div class="kv-migrate-overlay" @click.self="close">
    <div class="kv-migrate-dialog">
      <div class="kv-migrate-header">
        <h4>Migrate VM — {{ vm.metadata.name }}</h4>
        <button class="kv-close-btn" @click="close">
          <i class="icon icon-close" />
        </button>
      </div>

      <div class="kv-migrate-body">
        <div v-if="loading" class="kv-center">
          <i class="icon icon-spinner icon-spin" />
          Loading nodes…
        </div>

        <template v-else>
          <div v-if="error" class="banner banner-error mb-10">
            <i class="icon icon-warning mr-5" />{{ error }}
          </div>

          <div class="mb-10">
            <label class="kv-label">Target node</label>
            <select v-model="selectedNode" class="kv-select">
              <option v-for="opt in nodeOptions" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <p v-if="currentNode" class="kv-hint">
              Current node: <strong>{{ currentNode }}</strong>
            </p>
          </div>
        </template>
      </div>

      <div class="kv-migrate-footer">
        <button class="btn role-secondary" :disabled="migrating" @click="close">
          Cancel
        </button>
        <button
          class="btn role-primary ml-10"
          :disabled="loading || migrating"
          @click="migrate"
        >
          <i v-if="migrating" class="icon icon-spinner icon-spin mr-5" />
          {{ migrating ? 'Migrating…' : 'Migrate' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.kv-migrate-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.kv-migrate-dialog {
  background: var(--body-bg, #fff);
  border: 1px solid var(--border);
  border-radius: 6px;
  width: 440px;
  max-width: 95vw;
  display: flex;
  flex-direction: column;
}

.kv-migrate-header {
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

.kv-migrate-body {
  padding: 20px;
  flex: 1;
}

.kv-migrate-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
}

.kv-center {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--input-label);
}

.kv-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--input-label);
  margin-bottom: 6px;
}

.kv-select {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--body-text);
  font-size: 13px;
}

.kv-hint {
  margin-top: 6px;
  font-size: 12px;
  color: var(--input-label);
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
