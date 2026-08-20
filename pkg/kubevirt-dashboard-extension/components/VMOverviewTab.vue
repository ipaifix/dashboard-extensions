<script>
import { formatSi, parseSi } from '@shell/utils/units';
import VMMetricsTab from './VMMetricsTab';

export default {
  name: 'VMOverviewTab',

  components: { VMMetricsTab },

  props: {
    vm: {
      type:     Object,
      required: true,
    },
    vmi: {
      type:    Object,
      default: null,
    },
    nodes: {
      type:    Array,
      default: () => [],
    },
    pods: {
      type:    Array,
      default: () => [],
    },
    canAbortMigration: {
      type:    Boolean,
      default: false,
    },
  },

  emits: ['abort-migration'],

  computed: {
    isRestoring() {
      return !!this.vm?.isRestoring || this.vm?.actualState === 'Restoring';
    },

    namespace() {
      return this.vm.metadata?.namespace;
    },

    createdAt() {
      return this.vm.metadata?.creationTimestamp;
    },

    hostname() {
      return this.vmi?.spec?.hostname || this.vm.spec?.template?.spec?.hostname || this.vm.metadata?.name;
    },

    nodeName() {
      return this.vmi?.status?.nodeName || '—';
    },

    nodeObj() {
      return this.nodes.find((n) => n.metadata?.name === this.nodeName) || null;
    },

    nodeLocation() {
      const node = this.nodeObj;

      if (!node || !this.nodeName || this.nodeName === '—') {
        return null;
      }

      if (node.detailLocation) {
        return node.detailLocation;
      }

      const clusterId = this.$store.getters['clusterId'];

      return {
        name:   'c-cluster-product-resource-id',
        params: {
          product:  'explorer',
          cluster:  clusterId,
          resource: 'node',
          id:       this.nodeName,
        },
      };
    },

    virtLauncherPod() {
      const vmName = this.vm?.metadata?.name;
      const ns = this.namespace;

      if (!vmName || !ns || !this.pods?.length) {
        return null;
      }

      const candidates = this.pods.filter((p) => p.metadata?.namespace === ns);
      const byLabel = candidates.find((p) => {
        const labels = p.metadata?.labels || {};

        return labels['kubevirt.io'] === 'virt-launcher' &&
          (labels['kubevirt.io/domain'] === vmName || labels['vm.kubevirt.io/name'] === vmName);
      });

      if (byLabel) {
        return byLabel;
      }

      const vmiUid = this.vmi?.metadata?.uid;
      const vmiName = this.vmi?.metadata?.name;

      if (vmiUid || vmiName) {
        const byOwner = candidates.find((p) => {
          const owners = p.metadata?.ownerReferences || [];

          return owners.some((o) => o.kind === 'VirtualMachineInstance' &&
            ((vmiUid && o.uid === vmiUid) || (vmiName && o.name === vmiName)));
        });

        if (byOwner) {
          return byOwner;
        }
      }

      return candidates.find((p) => {
        const name = p.metadata?.name || '';

        return name.startsWith('virt-launcher-') && name.includes(vmName);
      }) || null;
    },

    virtLauncherPodName() {
      return this.virtLauncherPod?.metadata?.name || null;
    },

    virtLauncherPodLocation() {
      const pod = this.virtLauncherPod;

      if (!pod) {
        return null;
      }

      if (pod.detailLocation) {
        return pod.detailLocation;
      }

      const clusterId = this.$store.getters['clusterId'];
      const id = pod.metadata?.name;

      if (!id) {
        return null;
      }

      return {
        name:   'c-cluster-product-resource-namespace-id',
        params: {
          product:   'explorer',
          cluster:   clusterId,
          resource:  'pod',
          namespace: this.namespace,
          id,
        },
      };
    },

    ipAddresses() {
      const ifaces = this.vmi?.status?.interfaces || [];

      return ifaces.flatMap((i) => i.ipAddresses || (i.ipAddress ? [i.ipAddress] : [])).filter(Boolean);
    },

    guestOS() {
      return this.vmi?.status?.guestOSInfo?.prettyName || null;
    },

    vCPUs() {
      return this.vm.vCPUs || '—';
    },

    memory() {
      const raw = this.vm.displayMemory;

      if (!raw) return '—';
      try {
        return formatSi(parseSi(raw), {
          increment:   1024,
          addSuffix:   true,
          maxExponent: 3,
          minExponent: 3,
          suffix:      'i',
        });
      } catch {
        return raw;
      }
    },

    runStrategy() {
      return this.vm.spec?.runStrategy || '—';
    },

    machineType() {
      return this.vm.spec?.template?.spec?.domain?.machine?.type || 'q35';
    },

    agentConnected() {
      return this.vm.isQemuInstalled;
    },

    migrationState() {
      return this.vmi?.status?.migrationState || null;
    },

    migrationPhase() {
      return this.migrationState?.status || null;
    },

    migrationSourceNode() {
      return this.migrationState?.sourceNode || null;
    },

    migrationTargetNode() {
      return this.migrationState?.targetNode || null;
    },

    isMigrating() {
      return this.migrationPhase && !['Failed', 'Succeeded'].includes(this.migrationPhase);
    },

    migrationFailed() {
      return this.migrationPhase === 'Failed';
    },

    conditions() {
      return this.vmi?.status?.conditions || [];
    },

    vmExpectedRunning() {
      if (typeof this.vm?.isVMExpectedRunning === 'boolean') {
        return this.vm.isVMExpectedRunning;
      }

      return !['Off', 'Stopped', 'Halted'].includes(this.vm?.actualState);
    },

    displayedConditions() {
      if (this.vmExpectedRunning) {
        return this.conditions;
      }

      return this.conditions.filter((condition) => !this.isSchedulingCondition(condition));
    },
  },

  methods: {
    isSchedulingCondition(condition) {
      const reason = condition?.reason || '';
      const type = condition?.type || '';
      const message = condition?.message || '';

      return (
        /unschedulable/i.test(reason) ||
        /unschedulable/i.test(message) ||
        /nodes are available/i.test(message) ||
        (type === 'PodScheduled' && condition?.status === 'False')
      );
    },
  },
};
</script>

<template>
  <div class="vm-overview">
    <!-- Migration banner -->
    <div v-if="isMigrating" class="banner banner-info mb-20">
      <i class="icon icon-spinner icon-spin mr-10" />
      <span>
        {{ t('kubevirt.virtualMachine.detail.migration.inProgress', {
          source: migrationSourceNode,
          target: migrationTargetNode,
          phase: migrationPhase,
        }, true) || `Migration in progress — from ${ migrationSourceNode } to ${ migrationTargetNode } (phase: ${ migrationPhase })` }}
      </span>
      <button
        v-if="canAbortMigration"
        class="btn btn-sm role-secondary ml-20"
        @click="$emit('abort-migration')"
      >
        {{ t('kubevirt.action.abortMigration', {}, true) || 'Abort Migration' }}
      </button>
    </div>

    <div v-if="migrationFailed" class="banner banner-error mb-20">
      <i class="icon icon-warning mr-10" />
      {{ t('kubevirt.virtualMachine.detail.migration.failed', {
        source: migrationSourceNode,
        target: migrationTargetNode,
      }, true) || `Last migration failed (${ migrationSourceNode } → ${ migrationTargetNode })` }}
    </div>

    <div v-if="isRestoring" class="banner banner-info mb-20">
      <i class="icon icon-spinner icon-spin mr-10" />
      <span>
        {{ t('kubevirt.virtualMachine.detail.restore.inProgress', {}, true)
          || 'Restore in progress — waiting for VirtualMachineRestore / volumes to complete…' }}
      </span>
    </div>

    <div class="overview-grid">
      <!-- Left column: VM details -->
      <div class="overview-section">
        <h3>{{ t('kubevirt.virtualMachine.detail.details.title.vmDetails') }}</h3>
        <div class="detail-row">
          <span class="label">{{ t('kubevirt.virtualMachine.detail.details.name') }}</span>
          <span>{{ vm.metadata.name }}</span>
        </div>
        <div class="detail-row">
          <span class="label">{{ t('kubevirt.virtualMachine.detail.details.namespace') }}</span>
          <span>{{ namespace }}</span>
        </div>
        <div class="detail-row">
          <span class="label">{{ t('kubevirt.virtualMachine.detail.details.created') }}</span>
          <span>{{ createdAt }}</span>
        </div>
        <div class="detail-row">
          <span class="label">{{ t('kubevirt.virtualMachine.detail.details.hostname') }}</span>
          <span>{{ hostname }}</span>
        </div>
        <div class="detail-row">
          <span class="label">{{ t('kubevirt.virtualMachine.detail.details.status') }}</span>
          <span>{{ vm.actualState }}</span>
        </div>
        <div v-if="guestOS" class="detail-row">
          <span class="label">{{ t('kubevirt.virtualMachine.detail.details.operatingSystem') }}</span>
          <span>{{ guestOS }}</span>
        </div>
      </div>

      <!-- Right column: Resources & placement -->
      <div class="overview-section">
        <h3>{{ t('kubevirt.virtualMachine.detail.details.title.requirements') }}</h3>
        <div class="detail-row">
          <span class="label">{{ t('kubevirt.generic.cpu') }}</span>
          <span>{{ vCPUs }} vCPU</span>
        </div>
        <div class="detail-row">
          <span class="label">{{ t('kubevirt.generic.memory') }}</span>
          <span>{{ memory }}</span>
        </div>
        <div class="detail-row">
          <span class="label">{{ t('kubevirt.virtualMachine.runStrategy') }}</span>
          <span>{{ runStrategy }}</span>
        </div>
        <div class="detail-row">
          <span class="label">Machine Type</span>
          <span>{{ machineType }}</span>
        </div>
        <div class="detail-row">
          <span class="label">{{ t('kubevirt.virtualMachine.detail.details.node') }}</span>
          <span v-if="nodeLocation">
            <router-link :to="nodeLocation">
              {{ nodeName }}
            </router-link>
          </span>
          <span v-else>{{ nodeName }}</span>
        </div>
        <div class="detail-row">
          <span class="label">{{ t('kubevirt.virtualMachine.detail.details.pod', {}, true) || 'Pod' }}</span>
          <span v-if="virtLauncherPodLocation">
            <router-link :to="virtLauncherPodLocation">
              {{ virtLauncherPodName }}
            </router-link>
          </span>
          <span v-else class="text-muted">—</span>
        </div>
        <div v-if="ipAddresses.length" class="detail-row">
          <span class="label">{{ t('kubevirt.virtualMachine.detail.details.ipAddress') }}</span>
          <span>{{ ipAddresses.join(', ') }}</span>
        </div>
        <div class="detail-row">
          <span class="label">Guest Agent</span>
          <span :class="agentConnected ? 'text-success' : 'text-muted'">
            {{ agentConnected ? 'Connected' : 'Not connected' }}
          </span>
        </div>
      </div>
    </div>

    <!-- VMI Conditions -->
    <div v-if="displayedConditions.length" class="overview-section mt-20">
      <h3>Conditions</h3>
      <table class="conditions-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Status</th>
            <th>Reason</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in displayedConditions" :key="c.type">
            <td>{{ c.type }}</td>
            <td :class="c.status === 'True' ? 'text-success' : 'text-muted'">
              {{ c.status }}
            </td>
            <td>{{ c.reason || '—' }}</td>
            <td>{{ c.message || '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="overview-section overview-metrics mt-20">
      <VMMetricsTab :vm="vm" :vmi="vmi" embedded />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.vm-overview {
  padding: 20px;
}

.overview-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
}

.overview-section {
  h3 {
    border-bottom: 1px solid var(--border);
    padding-bottom: 8px;
    margin-bottom: 12px;
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--input-label);
  }
}

.overview-metrics {
  min-width: 0;
}

.detail-row {
  display: flex;
  align-items: center;
  padding: 4px 0;
  font-size: 13px;

  .label {
    width: 160px;
    flex-shrink: 0;
    color: var(--input-label);
    font-weight: 500;
  }
}

.conditions-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th {
    text-align: left;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    color: var(--input-label);
    font-weight: 600;
  }

  td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
  }
}

.banner {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  border-radius: 4px;

  &.banner-info {
    background: var(--info-banner-bg, rgba(70, 130, 180, 0.15));
    border: 1px solid var(--primary);
  }

  &.banner-error {
    background: var(--error-banner-bg, rgba(200, 50, 50, 0.15));
    border: 1px solid var(--error);
    color: var(--error);
  }
}

.text-success { color: var(--success); }
.text-muted   { color: var(--input-label); }
</style>
