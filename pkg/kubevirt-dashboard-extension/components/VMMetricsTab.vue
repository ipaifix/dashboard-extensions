<script>
const DEBUG_METRICS_KEY = 'kubevirt-debug-metrics';

function isMetricsDebugEnabled() {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(DEBUG_METRICS_KEY) === '1';
  } catch {
    return false;
  }
}

export default {
  name: 'VMMetricsTab',

  props: {
    vm: {
      type:     Object,
      required: true,
    },
    vmi: {
      type:    Object,
      default: null,
    },
    embedded: {
      type:    Boolean,
      default: false,
    },
  },

  data() {
    return {
      prometheusAvailable: null,
      loading:             false,
      error:               null,
      metrics:             {
        cpu:       null,
        memUsed:   null,
        memAvail:  null,
        netRx:     null,
        netTx:     null,
        diskRead:  null,
        diskWrite: null,
      },
      refreshTimer:   null,
      debugQueries:   [],
      labelStrategy:  null,
    };
  },

  computed: {
    allMetricsNull() {
      return Object.values(this.metrics).every((v) => v === null);
    },

    clusterId() {
      return this.$store.getters['clusterId'];
    },

    vmName() {
      return this.vm.metadata?.name;
    },

    namespace() {
      return this.vm.metadata?.namespace;
    },

    isRunning() {
      return this.vm.actualState === 'Running';
    },

    cpuPercent() {
      if (this.metrics.cpu === null) return null;

      return (this.metrics.cpu * 100).toFixed(2);
    },

    memUsedMiB() {
      if (this.metrics.memUsed === null) return null;

      return (this.metrics.memUsed / 1024 / 1024).toFixed(1);
    },

    memAvailMiB() {
      if (this.metrics.memAvail === null) return null;

      return (this.metrics.memAvail / 1024 / 1024).toFixed(1);
    },

    netRxKBs() {
      if (this.metrics.netRx === null) return null;

      return (this.metrics.netRx / 1024).toFixed(2);
    },

    netTxKBs() {
      if (this.metrics.netTx === null) return null;

      return (this.metrics.netTx / 1024).toFixed(2);
    },

    diskReadKBs() {
      if (this.metrics.diskRead === null) return null;

      return (this.metrics.diskRead / 1024).toFixed(2);
    },

    diskWriteKBs() {
      if (this.metrics.diskWrite === null) return null;

      return (this.metrics.diskWrite / 1024).toFixed(2);
    },

    cpuBadge() {
      const v = parseFloat(this.cpuPercent);

      if (isNaN(v)) return 'unknown';
      if (v < 70) return 'success';
      if (v < 90) return 'warning';

      return 'error';
    },

    memBadge() {
      if (this.metrics.memUsed === null || this.metrics.memAvail === null) return 'unknown';
      const total = this.metrics.memUsed + this.metrics.memAvail;

      if (total === 0) return 'unknown';
      const pct = (this.metrics.memUsed / total) * 100;

      if (pct < 70) return 'success';
      if (pct < 90) return 'warning';

      return 'error';
    },

    cards() {
      return [
        {
          key:   'cpu',
          title: 'CPU Usage',
          value: this.cpuPercent,
          unit:  '%',
          badge: this.cpuBadge,
          icon:  'icon-cpu',
        },
        {
          key:   'memUsed',
          title: 'Memory Used',
          value: this.memUsedMiB,
          unit:  'MiB',
          badge: this.memBadge,
          icon:  'icon-storage',
        },
        {
          key:   'memAvail',
          title: 'Memory Available',
          value: this.memAvailMiB,
          unit:  'MiB',
          badge: 'neutral',
          icon:  'icon-storage',
        },
        {
          key:   'netRx',
          title: 'Network RX',
          value: this.netRxKBs,
          unit:  'KB/s',
          badge: 'neutral',
          icon:  'icon-chevron-down',
        },
        {
          key:   'netTx',
          title: 'Network TX',
          value: this.netTxKBs,
          unit:  'KB/s',
          badge: 'neutral',
          icon:  'icon-chevron-up',
        },
        {
          key:   'diskRead',
          title: 'Disk Read',
          value: this.diskReadKBs,
          unit:  'KB/s',
          badge: 'neutral',
          icon:  'icon-copy',
        },
        {
          key:   'diskWrite',
          title: 'Disk Write',
          value: this.diskWriteKBs,
          unit:  'KB/s',
          badge: 'neutral',
          icon:  'icon-edit',
        },
      ];
    },
  },

  async mounted() {
    if (this.isRunning) {
      await this.init();
      if (this.prometheusAvailable) {
        this.startAutoRefresh();
      }
    }
  },

  beforeUnmount() {
    this.stopAutoRefresh();
  },

  watch: {
    async isRunning(running) {
      if (running) {
        await this.init();
        if (this.prometheusAvailable) {
          this.startAutoRefresh();
        }

        return;
      }

      this.stopAutoRefresh();
    },
  },

  methods: {
    debugLog(...args) {
      if (isMetricsDebugEnabled()) {
        // eslint-disable-next-line no-console
        console.debug(...args);
      }
    },

    promUrl(query) {
      const base = `/k8s/clusters/${ this.clusterId }/api/v1/namespaces/cattle-monitoring-system/services/http:rancher-monitoring-prometheus:9090/proxy/api/v1/query`;

      return `${ base }?query=${ encodeURIComponent(query) }`;
    },

    async queryProm(promql) {
      const url = this.promUrl(promql);

      try {
        const res = await this.$store.dispatch('cluster/request', {
          url,
          redirectUnauthorized: false,
        });

        this.debugLog(`[VMMetrics] ${ promql }`, res?.data);
        const result = res?.data?.result;

        if (!result || result.length === 0) return null;

        return parseFloat(result[0].value[1]);
      } catch (err) {
        this.debugLog(`[VMMetrics] Error for ${ promql }:`, err);

        return null;
      }
    },

    async detectLabelStrategy() {
      const n  = this.namespace;
      const vm = this.vmName;

      const strategies = [
        { label: 'name', filter: `name="${ vm }",namespace="${ n }"` },
        { label: 'kubernetes_vmi_label_vm_kubevirt_io_name', filter: `kubernetes_vmi_label_vm_kubevirt_io_name="${ vm }",namespace="${ n }"` },
        { label: 'name (exported_namespace)', filter: `name="${ vm }",exported_namespace="${ n }"` },
        { label: 'name (no namespace)', filter: `name="${ vm }"` },
      ];

      for (const s of strategies) {
        const q = `kubevirt_vmi_cpu_usage_seconds_total{${ s.filter }}`;

        try {
          const res = await this.$store.dispatch('cluster/request', {
            url:                  this.promUrl(q),
            redirectUnauthorized: false,
          });
          const result = res?.data?.result || [];

          this.debugLog(`[VMMetrics] Strategy "${ s.label }": ${ result.length } results`);
          if (result.length > 0) {
            this.debugLog(`[VMMetrics] Using label strategy: ${ s.label }`);

            return s;
          }
        } catch (err) {
          this.debugLog(`[VMMetrics] Strategy "${ s.label }" error:`, err);
        }
      }

      this.debugLog('[VMMetrics] No label strategy found any results for CPU metric.');

      return null;
    },

    async checkPrometheus() {
      try {
        await this.$store.dispatch('cluster/request', {
          url:                 this.promUrl('up'),
          redirectUnauthorized: false,
        });

        return true;
      } catch {
        return false;
      }
    },

    async init() {
      if (!this.isRunning) {
        return;
      }

      this.loading = true;
      this.error   = null;
      this.prometheusAvailable = await this.checkPrometheus();
      if (this.prometheusAvailable) {
        this.labelStrategy = await this.detectLabelStrategy();
        await this.fetchMetrics();
      }
      this.loading = false;
    },

    buildFilter(vm, n) {
      if (!this.labelStrategy) {
        return `name="${vm}",namespace="${n}"`;
      }

      return this.labelStrategy.filter;
    },

    async fetchMetrics() {
      const n  = this.namespace;
      const vm = this.vmName;
      const f  = this.buildFilter(vm, n);

      // Essayer kubevirt_vmi_memory_used_bytes, sinon kubevirt_vmi_memory_resident_bytes
      const memUsedQuery = async() => {
        const v = await this.queryProm(`kubevirt_vmi_memory_used_bytes{${f}}`);

        if (v !== null) return v;

        return this.queryProm(`kubevirt_vmi_memory_resident_bytes{${f}}`);
      };

      // Essayer kubevirt_vmi_cpu_usage_seconds_total, sinon system+user
      const cpuQuery = async() => {
        const v = await this.queryProm(`rate(kubevirt_vmi_cpu_usage_seconds_total{${f}}[5m])`);

        if (v !== null) return v;
        const sys  = await this.queryProm(`rate(kubevirt_vmi_cpu_system_usage_seconds_total{${f}}[5m])`);
        const user = await this.queryProm(`rate(kubevirt_vmi_cpu_user_usage_seconds_total{${f}}[5m])`);

        if (sys !== null || user !== null) return (sys || 0) + (user || 0);

        return null;
      };

      const queries = {
        cpu:       cpuQuery,
        memUsed:   memUsedQuery,
        memAvail:  () => this.queryProm(`kubevirt_vmi_memory_available_bytes{${f}}`),
        netRx:     () => this.queryProm(`rate(kubevirt_vmi_network_receive_bytes_total{${f}}[5m])`),
        netTx:     () => this.queryProm(`rate(kubevirt_vmi_network_transmit_bytes_total{${f}}[5m])`),
        diskRead:  () => this.queryProm(`rate(kubevirt_vmi_storage_read_traffic_bytes_total{${f}}[5m])`),
        diskWrite: () => this.queryProm(`rate(kubevirt_vmi_storage_write_traffic_bytes_total{${f}}[5m])`),
      };

      this.debugQueries = [
        `rate(kubevirt_vmi_cpu_usage_seconds_total{${f}}[5m])`,
        `kubevirt_vmi_memory_used_bytes{${f}}`,
        `kubevirt_vmi_memory_available_bytes{${f}}`,
        `rate(kubevirt_vmi_network_receive_bytes_total{${f}}[5m])`,
        `rate(kubevirt_vmi_storage_read_traffic_bytes_total{${f}}[5m])`,
      ];

      try {
        const results = await Promise.all(
          Object.entries(queries).map(async([key, fn]) => {
            const val = await fn();

            return [key, val];
          })
        );

        results.forEach(([key, val]) => {
          this.metrics[key] = val;
        });
        this.error = null;
      } catch (err) {
        this.error = err?.message || 'Failed to fetch metrics';
      }
    },

    async refresh() {
      this.loading = true;
      await this.fetchMetrics();
      this.loading = false;
    },

    startAutoRefresh() {
      this.refreshTimer = setInterval(() => {
        if (this.isRunning) {
          this.fetchMetrics();
        }
      }, 30000);
    },

    stopAutoRefresh() {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
      }
    },
  },
};
</script>

<template>
  <div class="vm-metrics">
    <!-- Loading initial -->
    <div v-if="loading && prometheusAvailable === null" class="metrics-loading">
      <i class="icon icon-spinner icon-spin mr-10" />
      Checking Prometheus availability…
    </div>

    <!-- Prometheus non disponible -->
    <div v-else-if="prometheusAvailable === false" class="banner banner-warning">
      <i class="icon icon-warning mr-10" />
      <div>
        <strong>Rancher Monitoring not available</strong>
        <p class="mt-5">
          Install Rancher Monitoring (Prometheus) to enable VM metrics.
        </p>
      </div>
    </div>

    <!-- Prometheus disponible -->
    <template v-else-if="prometheusAvailable">
      <div class="metrics-header">
        <h3>VM Metrics</h3>
        <div class="metrics-actions">
          <span v-if="isRunning" class="badge badge-success mr-10">
            <i class="icon icon-dot mr-5" />Auto-refresh 30s
          </span>
          <button class="btn btn-sm role-secondary" :disabled="loading" @click="refresh">
            <i :class="['icon', 'icon-refresh', { 'icon-spin': loading }]" />
            Refresh
          </button>
        </div>
      </div>

      <!-- Erreur métriques KubeVirt -->
      <div v-if="error" class="banner banner-error mb-15">
        <i class="icon icon-warning mr-10" />
        {{ error }}
      </div>

      <!-- VM non Running -->
      <div v-if="!isRunning" class="banner banner-info mb-15">
        <i class="icon icon-info mr-10" />
        VM is not running — metrics are only available for running VMs.
      </div>

      <!-- Section debug : toutes les métriques sont null -->
      <div v-if="!loading && allMetricsNull && isRunning" class="banner banner-warning mb-15">
        <div style="width:100%">
          <strong>Aucune donnée de métrique reçue</strong>
          <p class="mt-5">
            Prometheus est accessible mais les requêtes KubeVirt ne retournent aucun résultat.<br>
            Vérifiez la <strong>console du navigateur</strong> (F12 → Console) pour les logs <code>[VMMetrics]</code> qui indiquent les résultats bruts.
          </p>
          <p class="mt-5">
            Stratégie de labels détectée : <code>{{ labelStrategy ? labelStrategy.label : 'aucune (fallback name/namespace)' }}</code>
          </p>
          <details class="mt-5">
            <summary style="cursor:pointer;font-weight:600;">Requêtes PromQL utilisées</summary>
            <ul style="margin:6px 0 0 16px;font-size:12px;font-family:monospace;">
              <li v-for="q in debugQueries" :key="q">{{ q }}</li>
            </ul>
          </details>
          <p class="mt-5" style="font-size:12px;">
            Vérifiez que KubeVirt exporte bien des métriques vers Prometheus et que le ServiceMonitor KubeVirt est actif.
          </p>
        </div>
      </div>

      <!-- Grille de cartes -->
      <div class="metrics-grid">
        <div
          v-for="card in cards"
          :key="card.key"
          class="metric-card"
        >
          <div class="metric-card__header">
            <i :class="['icon', card.icon]" />
            <span class="metric-card__title">{{ card.title }}</span>
          </div>
          <div class="metric-card__body">
            <span v-if="card.value !== null" class="metric-card__value">{{ card.value }}</span>
            <span v-else class="metric-card__value metric-card__value--na">—</span>
            <span class="metric-card__unit">{{ card.unit }}</span>
          </div>
          <div v-if="card.badge !== 'neutral' && card.badge !== 'unknown'" class="metric-card__footer">
            <span :class="['status-badge', `status-badge--${card.badge}`]">
              {{ card.badge === 'success' ? 'Normal' : card.badge === 'warning' ? 'High' : 'Critical' }}
            </span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.vm-metrics {
  padding: 20px;
}

.metrics-loading {
  display: flex;
  align-items: center;
  color: var(--input-label);
  font-size: 14px;
}

.metrics-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 10px;

  h3 {
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--input-label);
    margin: 0;
  }
}

.metrics-actions {
  display: flex;
  align-items: center;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
  }
}

.metric-card {
  background: var(--body-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--input-label);
    font-size: 12px;

    .icon {
      font-size: 14px;
    }
  }

  &__title {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  &__body {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  &__value {
    font-size: 28px;
    font-weight: 700;
    color: var(--body-text);
    line-height: 1;

    &--na {
      color: var(--input-label);
      font-size: 22px;
    }
  }

  &__unit {
    font-size: 13px;
    color: var(--input-label);
  }

  &__footer {
    margin-top: 4px;
  }
}

.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;

  &--success {
    background: rgba(var(--success-rgb, 92, 184, 92), 0.15);
    color: var(--success);
    border: 1px solid var(--success);
  }

  &--warning {
    background: rgba(var(--warning-rgb, 240, 173, 78), 0.15);
    color: var(--warning);
    border: 1px solid var(--warning);
  }

  &--error {
    background: rgba(var(--error-rgb, 217, 83, 79), 0.15);
    color: var(--error);
    border: 1px solid var(--error);
  }
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;

  &-success {
    color: var(--success);
    border: 1px solid var(--success);
    background: rgba(var(--success-rgb, 92, 184, 92), 0.1);
  }
}

.banner {
  display: flex;
  align-items: flex-start;
  padding: 12px 16px;
  border-radius: 4px;
  font-size: 13px;
  margin-bottom: 15px;

  &-info {
    background: rgba(70, 130, 180, 0.1);
    border: 1px solid var(--primary);
    color: var(--body-text);
  }

  &-warning {
    background: rgba(240, 173, 78, 0.1);
    border: 1px solid var(--warning);
    color: var(--body-text);
  }

  &-error {
    background: rgba(217, 83, 79, 0.1);
    border: 1px solid var(--error);
    color: var(--error);
  }

  p {
    margin: 0;
    color: var(--input-label);
  }
}

.mt-5  { margin-top: 5px; }
.mt-15 { margin-top: 15px; }
.mr-5  { margin-right: 5px; }
.mr-10 { margin-right: 10px; }
.mb-15 { margin-bottom: 15px; }
</style>
