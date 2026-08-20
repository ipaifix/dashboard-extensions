<script>
import Loading from '@shell/components/Loading';
import Tabbed from '@shell/components/Tabbed';
import Tab from '@shell/components/Tabbed/Tab';
import { allHash } from '@shell/utils/promise';
import { POD, NODE, PVC } from '@shell/config/types';
import { VMI_RESOURCE_NAME, VM_RESTORE_RESOURCE_NAME } from '../constants';
import VMOverviewTab from '../components/VMOverviewTab';
import VMDisksTab from '../components/VMDisksTab';
import VMNetworksTab from '../components/VMNetworksTab';
import VMConsoleTab from '../components/VMConsoleTab';
import VMSnapshotsTab from '../components/VMSnapshotsTab';
import VMLogsTab from '../components/VMLogsTab';
export default {
  name: 'VirtualMachineDetail',

  components: {
    Loading,
    Tabbed,
    Tab,
    VMOverviewTab,
    VMDisksTab,
    VMNetworksTab,
    VMConsoleTab,
    VMSnapshotsTab,
    VMLogsTab,
  },

  props: {
    value: {
      type:     Object,
      required: true,
    },
  },

  data() {
    return {
      vmi:      null,
      allNodes: [],
      allPVCs:  [],
      allPods:  [],
    };
  },

  async fetch() {
    const resourcesToFetch = {
      vmis:     this.$store.dispatch('cluster/findAll', { type: VMI_RESOURCE_NAME }),
      nodes:    this.$store.dispatch('cluster/findAll', { type: NODE }),
      pvcs:     this.$store.dispatch('cluster/findAll', { type: PVC }),
      restores: this.$store.dispatch('cluster/findAll', { type: VM_RESTORE_RESOURCE_NAME }),
    };

    if (this.$store.getters['cluster/schemaFor'](POD)) {
      resourcesToFetch.pods = this.$store.dispatch('cluster/findAll', { type: POD });
    }

    const resources = await allHash(resourcesToFetch);

    this.allNodes = resources.nodes || [];
    this.allPVCs  = resources.pvcs  || [];
    this.allPods  = resources.pods  || [];
    this.vmi      = (resources.vmis || []).find((v) => v.id === this.value.id) || null;
  },

  computed: {
    isMigrating() {
      return !!this.vmi?.status?.migrationState &&
        !['Failed', 'Succeeded'].includes(this.vmi?.status?.migrationState?.status);
    },

    canAbortMigration() {
      return this.isMigrating;
    },
  },

  methods: {
    async abortMigration() {
      const clusterId = this.$store.getters['clusterId'];
      const ns        = this.value.metadata.namespace;
      const name      = this.value.metadata.name;

      try {
        const res = await this.$store.dispatch('cluster/request', {
          method: 'GET',
          url:    `/k8s/clusters/${ clusterId }/apis/kubevirt.io/v1/namespaces/${ ns }/virtualmachineinstancemigrations`,
        });

        const active = (res?.items || []).find(
          (m) => m.spec?.vmiName === name &&
            !['Failed', 'Succeeded'].includes(m.status?.phase)
        );

        if (active) {
          await this.$store.dispatch('cluster/request', {
            method: 'DELETE',
            url:    `/k8s/clusters/${ clusterId }/apis/kubevirt.io/v1/namespaces/${ ns }/virtualmachineinstancemigrations/${ active.metadata.name }`,
          });

          this.$store.dispatch('growl/success', {
            title:   this.t('generic.notification.title.succeed', {}, true),
            message: `Migration aborted for ${ name }.`,
          }, { root: true });
        }
      } catch (err) {
        this.$store.dispatch('growl/fromError', {
          title: this.t('generic.notification.title.error', {}, true),
          err,
        }, { root: true });
      }
    },
  },
};
</script>

<template>
  <Loading v-if="$fetchState.pending" />
  <div v-else class="vm-detail">
    <Tabbed :side-tabs="true">
      <Tab name="overview" :label="t('kubevirt.virtualMachine.detail.tabs.overview', {}, true) || 'Overview'" :weight="5">
        <VMOverviewTab
          :vm="value"
          :vmi="vmi"
          :nodes="allNodes"
          :pods="allPods"
          :can-abort-migration="canAbortMigration"
          @abort-migration="abortMigration"
        />
      </Tab>

      <Tab name="disks" :label="t('kubevirt.virtualMachine.detail.tabs.disks', {}, true) || 'Disks'" :weight="4">
        <VMDisksTab :vm="value" :pvcs="allPVCs" />
      </Tab>

      <Tab name="networks" :label="t('kubevirt.virtualMachine.detail.tabs.networks', {}, true) || 'Networks'" :weight="3">
        <VMNetworksTab :vm="value" :vmi="vmi" />
      </Tab>

      <Tab name="console" :label="t('kubevirt.virtualMachine.detail.tabs.console', {}, true) || 'Console'" :weight="2">
        <VMConsoleTab :vm="value" :vmi="vmi" />
      </Tab>

      <Tab name="logs" :label="t('kubevirt.virtualMachine.detail.tabs.logs', {}, true) || 'Logs'" :weight="1.5">
        <VMLogsTab :vm="value" />
      </Tab>

      <Tab name="snapshots" :label="t('kubevirt.virtualMachine.detail.tabs.snapshots', {}, true) || 'Snapshots'" :weight="0">
        <VMSnapshotsTab :vm="value" />
      </Tab>
    </Tabbed>

  </div>
</template>

<style lang="scss" scoped>
.vm-detail {
  height: 100%;
}
</style>
