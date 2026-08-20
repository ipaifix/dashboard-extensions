<script>
import vmActions from '../utils/vm-actions';

const {
  SERIAL_LOG_CONTAINER,
  LOG_SOURCE_SERIAL,
  LOG_SOURCE_FALLBACK,
  isContainerFallbackError,
} = vmActions;

const AUTO_REFRESH_MS = 12000;

export default {
  name: 'VMLogsTab',

  props: {
    vm: {
      type:     Object,
      required: true,
    },
  },

  data() {
    return {
      loading:      false,
      refreshing:   false,
      error:        null,
      logContent:   '',
      podName:      null,
      logSource:    null,
      serialFallbackUsed: false,
      lastUpdated:  null,
      refreshTimer: null,
    };
  },

  computed: {
    clusterId() {
      return this.$store.getters['clusterId'];
    },

    namespace() {
      return this.vm?.metadata?.namespace;
    },

    vmName() {
      return this.vm?.metadata?.name;
    },

    /** Align with Metrics/Console: no VMI/pod while not Running. */
    isRunning() {
      return this.vm?.actualState === 'Running';
    },

    hasLogs() {
      return !!this.logContent;
    },

    autoRefreshLabel() {
      if (!this.isRunning) {
        return '';
      }

      const sec = Math.floor(AUTO_REFRESH_MS / 1000);

      return this.t('kubevirt.virtualMachine.detail.logs.autoRefresh', { sec }, true) || `Auto-refresh ${ sec }s`;
    },

    serialFallbackMessage() {
      if (!this.serialFallbackUsed) {
        return '';
      }

      return this.t('kubevirt.virtualMachine.detail.logs.serialUnavailable', {}, true) || 'Serial console logs unavailable. Showing infrastructure logs.';
    },

    sourceLabel() {
      if (this.logSource === LOG_SOURCE_SERIAL) {
        return this.t('kubevirt.virtualMachine.detail.logs.source.serial', {}, true) || 'Source: guest-console-log';
      }

      if (this.logSource === LOG_SOURCE_FALLBACK) {
        return this.t('kubevirt.virtualMachine.detail.logs.source.fallback', {}, true) || 'Source: default container logs';
      }

      return '';
    },
  },

  watch: {
    isRunning: {
      immediate: false,
      handler(running) {
        if (running) {
          this.refreshLogs().then(() => this.startAutoRefresh());
        } else {
          this.stopAutoRefresh();
          this.clearLogsState();
        }
      },
    },
  },

  async mounted() {
    if (!this.isRunning) {
      this.clearLogsState();

      return;
    }

    await this.refreshLogs();
    this.startAutoRefresh();
  },

  beforeUnmount() {
    this.stopAutoRefresh();
  },

  methods: {
    clearLogsState() {
      this.loading = false;
      this.refreshing = false;
      this.error = null;
      this.logContent = '';
      this.podName = null;
      this.logSource = null;
      this.serialFallbackUsed = false;
    },

    buildPodsUrl() {
      const selector = encodeURIComponent(`kubevirt.io=virt-launcher,kubevirt.io/domain=${ this.vmName }`);

      return `/k8s/clusters/${ this.clusterId }/api/v1/namespaces/${ this.namespace }/pods?labelSelector=${ selector }`;
    },

    buildVirtLauncherPodsUrl() {
      const selector = encodeURIComponent('kubevirt.io=virt-launcher');

      return `/k8s/clusters/${ this.clusterId }/api/v1/namespaces/${ this.namespace }/pods?labelSelector=${ selector }`;
    },

    buildVmiUrl() {
      return `/k8s/clusters/${ this.clusterId }/apis/kubevirt.io/v1/namespaces/${ this.namespace }/virtualmachineinstances/${ this.vmName }`;
    },

    buildPodLogsUrl(podName, container) {
      const baseUrl = `/k8s/clusters/${ this.clusterId }/api/v1/namespaces/${ this.namespace }/pods/${ podName }/log?tailLines=500`;

      return container ? `${ baseUrl }&container=${ encodeURIComponent(container) }` : baseUrl;
    },

    extractErrorMessage(err) {
      const status = err?.status || err?.response?.status;
      const msg = err?.data?.message || err?.message || '';

      if (status === 403) {
        return this.t('kubevirt.virtualMachine.detail.logs.errors.forbidden', {}, true) || 'You do not have permission to read VM logs.';
      }

      if (status === 404) {
        return this.t('kubevirt.virtualMachine.detail.logs.errors.notFound', {}, true) || 'virt-launcher pod was not found for this VM.';
      }

      if (err?.code === 'NO_VIRT_LAUNCHER_POD') {
        return this.t('kubevirt.virtualMachine.detail.logs.errors.noPod', {}, true) || 'No virt-launcher pod found for this VM.';
      }

      return this.t('kubevirt.virtualMachine.detail.logs.errors.fetchFailed', { message: msg || 'unknown error' }, true) || `Failed to load VM logs: ${ msg || 'unknown error' }`;
    },

    pickVirtLauncherPod(items) {
      if (!Array.isArray(items) || !items.length) {
        return null;
      }

      const byDomainLabel = items.find((pod) => pod?.metadata?.labels?.['kubevirt.io/domain'] === this.vmName);

      if (byDomainLabel) {
        return byDomainLabel;
      }

      const byPrefix = items.find((pod) => pod?.metadata?.name?.startsWith(`virt-launcher-${ this.vmName }-`));

      return byPrefix || null;
    },

    podMatchesVmLabels(pod) {
      const labels = pod?.metadata?.labels || {};
      const vmName = this.vmName;

      return labels['kubevirt.io/domain'] === vmName || labels['vm.kubevirt.io/name'] === vmName;
    },

    podMatchesVmByNameHeuristic(pod) {
      const podName = pod?.metadata?.name || '';

      return podName.startsWith('virt-launcher-') && podName.includes(this.vmName);
    },

    findPodByOwnerReference(items, vmi) {
      if (!Array.isArray(items) || !items.length || !vmi) {
        return null;
      }

      const vmiUid = vmi?.metadata?.uid;
      const vmiName = vmi?.metadata?.name;

      return items.find((pod) => {
        const ownerRefs = pod?.metadata?.ownerReferences || [];

        return ownerRefs.some((owner) => {
          if (owner?.kind !== 'VirtualMachineInstance') {
            return false;
          }

          if (vmiUid && owner?.uid === vmiUid) {
            return true;
          }

          return !!vmiName && owner?.name === vmiName;
        });
      }) || null;
    },

    async fetchVirtLauncherPod() {
      const directRes = await this.$store.dispatch('cluster/request', {
        method: 'GET',
        url:    this.buildPodsUrl(),
      });
      const directItems = directRes?.items || [];
      const directPod = this.pickVirtLauncherPod(directItems);

      if (directPod) {
        return directPod;
      }

      const broadRes = await this.$store.dispatch('cluster/request', {
        method: 'GET',
        url:    this.buildVirtLauncherPodsUrl(),
      });
      const broadItems = broadRes?.items || [];
      const byLabels = broadItems.find((pod) => this.podMatchesVmLabels(pod));

      if (byLabels) {
        return byLabels;
      }

      let vmi = null;
      try {
        vmi = await this.$store.dispatch('cluster/request', {
          method: 'GET',
          url:    this.buildVmiUrl(),
        });
      } catch {
        // VMI absente (VM stopped) — fallback ownerReference silencieux
      }

      const byOwnerReference = this.findPodByOwnerReference(broadItems, vmi);

      if (byOwnerReference) {
        return byOwnerReference;
      }

      const byNameHeuristic = broadItems.find((pod) => this.podMatchesVmByNameHeuristic(pod));

      if (byNameHeuristic) {
        return byNameHeuristic;
      }

      const noPodError = new Error('No virt-launcher pod found');

      noPodError.code = 'NO_VIRT_LAUNCHER_POD';
      throw noPodError;
    },

    normalizeLogResponse(res) {
      if (typeof res === 'string') {
        return res;
      }

      if (typeof res?.data === 'string') {
        return res.data;
      }

      return '';
    },

    isContainerFallbackError(err) {
      return isContainerFallbackError(err);
    },

    async fetchLogsWithSourceFallback(podName) {
      try {
        const serialLogsRes = await this.$store.dispatch('cluster/request', {
          method: 'GET',
          url:    this.buildPodLogsUrl(podName, SERIAL_LOG_CONTAINER),
        });

        return {
          logSource:          LOG_SOURCE_SERIAL,
          serialFallbackUsed: false,
          logContent:         this.normalizeLogResponse(serialLogsRes),
        };
      } catch (err) {
        if (!this.isContainerFallbackError(err)) {
          throw err;
        }
        // guest-console-log absent (ex. VM stopped / container manquant) — fallback UI silencieux
      }

      const fallbackLogsRes = await this.$store.dispatch('cluster/request', {
        method: 'GET',
        url:    this.buildPodLogsUrl(podName),
      });

      return {
        logSource:          LOG_SOURCE_FALLBACK,
        serialFallbackUsed: true,
        logContent:         this.normalizeLogResponse(fallbackLogsRes),
      };
    },

    async refreshLogs() {
      if (!this.isRunning) {
        this.stopAutoRefresh();
        this.clearLogsState();

        return;
      }

      if (this.loading || this.refreshing) {
        return;
      }

      this.error = null;

      if (!this.namespace || !this.vmName) {
        this.error = this.t('kubevirt.virtualMachine.detail.logs.errors.invalidVm', {}, true) || 'VM name or namespace is missing.';
        this.logContent = '';

        return;
      }

      const firstLoad = !this.lastUpdated && !this.loading;
      this.loading = firstLoad;
      this.refreshing = !firstLoad;

      try {
        const pod = await this.fetchVirtLauncherPod();
        this.podName = pod?.metadata?.name || null;
        this.logSource = null;
        this.serialFallbackUsed = false;

        const logsResult = await this.fetchLogsWithSourceFallback(this.podName);

        this.logContent = logsResult.logContent;
        this.logSource = logsResult.logSource;
        this.serialFallbackUsed = logsResult.serialFallbackUsed;
        this.lastUpdated = new Date();
      } catch (err) {
        this.logContent = '';
        this.logSource = null;
        this.serialFallbackUsed = false;
        this.error = this.extractErrorMessage(err);
      } finally {
        this.loading = false;
        this.refreshing = false;
      }
    },

    startAutoRefresh() {
      this.stopAutoRefresh();

      if (!this.isRunning) {
        return;
      }

      this.refreshTimer = setInterval(() => {
        this.refreshLogs();
      }, AUTO_REFRESH_MS);
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
  <div class="vm-logs-tab">
    <div class="logs-header">
      <div class="logs-meta">
        <h3>{{ t('kubevirt.virtualMachine.detail.logs.title', {}, true) || 'Serial Console Logs' }}</h3>
        <span class="text-muted">
          {{ t('kubevirt.virtualMachine.detail.logs.subtitle', {}, true) || 'Guest console output from virt-launcher.' }}
        </span>
        <span class="text-muted">
          {{ autoRefreshLabel }}
        </span>
      </div>
      <div class="logs-actions">
        <span v-if="podName" class="text-muted mr-10">
          {{ t('kubevirt.virtualMachine.detail.logs.pod', { pod: podName }, true) || `Pod: ${ podName }` }}
        </span>
        <span v-if="sourceLabel" class="text-muted mr-10">
          {{ sourceLabel }}
        </span>
        <button class="btn btn-sm role-secondary" :disabled="!isRunning || loading || refreshing" @click="refreshLogs">
          <i :class="['icon', 'icon-refresh', { 'icon-spin': loading || refreshing }]" />
          {{ t('kubevirt.virtualMachine.detail.logs.refresh', {}, true) || 'Refresh' }}
        </button>
      </div>
    </div>

    <div v-if="!isRunning" class="banner banner-info mb-10">
      <i class="icon icon-info mr-10" />
      {{ t('kubevirt.virtualMachine.detail.logs.notRunning', {}, true) || 'VM is stopped — serial logs unavailable' }}
    </div>

    <template v-else>
      <div v-if="error" class="banner banner-error mb-10">
        <i class="icon icon-warning mr-10" />
        {{ error }}
      </div>

      <div v-if="loading" class="logs-loading">
        <i class="icon icon-spinner icon-spin mr-10" />
        {{ t('kubevirt.virtualMachine.detail.logs.loading', {}, true) || 'Loading logs...' }}
      </div>

      <template v-else>
        <div v-if="serialFallbackMessage" class="banner banner-info mb-10">
          <i class="icon icon-info mr-10" />
          {{ serialFallbackMessage }}
        </div>

        <div v-if="!hasLogs && !error" class="banner banner-info mb-10">
          <i class="icon icon-info mr-10" />
          {{ t('kubevirt.virtualMachine.detail.logs.empty', {}, true) || 'No logs available for this VM yet.' }}
        </div>

        <pre v-else class="logs-output">{{ logContent }}</pre>
      </template>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.vm-logs-tab {
  padding: 20px;
}

.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.logs-meta h3 {
  margin: 0;
  font-size: 14px;
  text-transform: uppercase;
}

.logs-meta .text-muted {
  display: block;
  margin-top: 4px;
}

.logs-actions {
  display: flex;
  align-items: center;
}

.logs-loading {
  display: flex;
  align-items: center;
  color: var(--input-label);
}

.logs-output {
  margin: 0;
  max-height: 460px;
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--body-bg);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.35;
}

.banner {
  display: flex;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 4px;
  font-size: 13px;

  &-info {
    background: rgba(70, 130, 180, 0.1);
    border: 1px solid var(--primary);
    color: var(--body-text);
  }

  &-error {
    background: rgba(217, 83, 79, 0.1);
    border: 1px solid var(--error);
    color: var(--error);
  }
}

.text-muted { color: var(--input-label); }
.mr-10 { margin-right: 10px; }
.mb-10 { margin-bottom: 10px; }
</style>
