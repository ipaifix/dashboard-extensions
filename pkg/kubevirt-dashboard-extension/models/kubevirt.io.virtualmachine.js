import { HCI } from '../harvester/types';
import VirtVm from '../harvester/models/kubevirt.io.virtualmachine';
import { calculateVCPU } from './utils';
import { PRODUCT_NAME, VM_RESTORE_RESOURCE_NAME } from '../constants';
import vmActions from '../utils/vm-actions';

const {
  canForceStop: canForceStopVm,
  getForceStopPatchData,
  getForceStopPatchMode,
  isVmMigrating,
  isRestoreInProgress,
  resolveActualStateMigrating,
  shouldForceStopFromSchedulingBlock,
  usesRunStrategyStopPatch,
} = vmActions;

export default class VirtualMachine extends VirtVm {
  get detailLocation() {
    const id = this.id?.replace(/.*\//, '');

    return {
      name:   'c-cluster-product-resource-namespace-id',
      params: {
        product:   PRODUCT_NAME,
        cluster:   this.$rootGetters['clusterId'],
        resource:  this.type,
        namespace: this.metadata?.namespace,
        id,
      },
    };
  }

  get availableActions() {
    const out = super._availableActions;

    const clone = out.find((action) => action.action === 'goToClone');

    if (clone) {
      clone.action = 'goToCloneVM';
    }

    return [
      {
        action: 'stopVM',
        enabled: !!this.canStop,
        icon: 'icon icon-close',
        label: this.t('kubevirt.action.stop'),
        bulkable: true,
      },
      {
        action: 'forceStopVM',
        enabled: !!this.canForceStop,
        icon: 'icon icon-close',
        label: this.t('kubevirt.action.forceStop'),
        bulkable: true,
      },
      {
        action: 'startVM',
        enabled: !!this.canStart,
        icon: 'icon icon-play',
        label: this.t('kubevirt.action.start'),
        bulkable: true,
      },
      {
        action: 'softrebootVM',
        enabled: !!this.canSoftReboot,
        icon: 'icon icon-pipeline',
        label: this.t('kubevirt.action.softreboot'),
        bulkable: true,
      },
      {
        action: 'pauseVM',
        enabled: !!this.canPause,
        icon: 'icon icon-pause',
        label: this.t('kubevirt.action.pause'),
        bulkable: true,
      },
      {
        action: 'unpauseVM',
        enabled: !!this.canUnpause,
        icon: 'icon icon-spinner',
        label: this.t('kubevirt.action.unpause'),
        bulkable: true,
      },
      {
        action: 'cloneVM',
        enabled: true,
        icon:    'icon icon-copy',
        label:   this.t('kubevirt.action.cloneVM'),
      },
      {
        action: 'migrateVM',
        enabled: !!this.canMigrate,
        icon: 'icon icon-copy',
        label: this.t('kubevirt.action.migrate'),
      },
      {
        action: 'abortMigrationVM',
        enabled: !!this.canAbortMigration,
        icon: 'icon icon-close',
        label: this.t('kubevirt.action.abortMigration'),
      },
      {
        action:  'takeSnapshot',
        enabled: !!this.isRunning || !!this.canStart,
        icon:    'icon icon-snapshot',
        label:   this.t('kubevirt.action.takeSnapshot'),
      },
      ...out,
    ];
  }
  async doVMSubresourceActionGrowl(subresource, actionName, opt = {}) {
    const { successMessage, ...requestOpt } = opt;
    const clusterId = this.$rootGetters['clusterId'];
    const url = `/k8s/clusters/${clusterId}/apis/subresources.kubevirt.io/v1/namespaces/${this.metadata.namespace}/${subresource}/${this.metadata.name}/${actionName}`;
    try {
      const response = await this.$dispatch(`request`, {
        headers: { accept: '*/*' },
        method: 'PUT',
        url,
        ...requestOpt,
      });

      if (successMessage) {
        this.$dispatch(
          'growl/success',
          {
            title: this.$rootGetters['i18n/t']('kubevirt.notification.title.succeed'),
            message: successMessage,
          },
          { root: true }
        );
      }

      return response;
    } catch (err) {
      this.$dispatch(
        'growl/fromError',
        {
          title: this.$rootGetters['i18n/t']('generic.notification.title.error'),
          err: err.data || err,
        },
        { root: true }
      );
    }
  }

  startVM() {
    this.doVMSubresourceActionGrowl('virtualmachines', 'start');
  }

  stopVM() {
    this.doVMSubresourceActionGrowl('virtualmachines', 'stop');
  }

  forceStopVM() {
    this.forceStopVMWithFallback();
  }

  get shouldForceStopFromSchedulingBlock() {
    return shouldForceStopFromSchedulingBlock({
      isStarting:      this.isStarting,
      printableStatus: this.status?.printableStatus,
    });
  }

  get usesRunStrategyStopPatch() {
    return usesRunStrategyStopPatch(this.spec);
  }

  get forceStopPatchData() {
    return getForceStopPatchData(this.spec);
  }

  get forceStopPatchMode() {
    return getForceStopPatchMode(this.spec);
  }

  async forceStopVMWithFallback() {
    const clusterId = this.$rootGetters['clusterId'];
    const namespace = this.metadata.namespace;
    const name = this.metadata.name;
    const subresourceUrl = `/k8s/clusters/${ clusterId }/apis/subresources.kubevirt.io/v1/namespaces/${ namespace }/virtualmachines/${ name }/stop`;
    const vmUrl = `/k8s/clusters/${ clusterId }/apis/kubevirt.io/v1/namespaces/${ namespace }/virtualmachines/${ name }`;
    const isSchedulingBlocked = this.shouldForceStopFromSchedulingBlock;

    const patchVmToHalted = async(growlMessage) => {
      await this.$dispatch('request', {
        method: 'PATCH',
        url: vmUrl,
        headers: {
          'content-type': 'application/merge-patch+json',
          accept: '*/*',
        },
        data: this.forceStopPatchData,
      });

      this.$dispatch(
        'growl/success',
        {
          title: this.$rootGetters['i18n/t']('kubevirt.notification.title.succeed'),
          message: growlMessage || this.t('kubevirt.notification.forceStopFallbackSuccess', {
            name,
            mode: this.forceStopPatchMode,
          }),
        },
        { root: true }
      );
    };

    try {
      await this.$dispatch('request', {
        headers: { accept: '*/*' },
        method: 'PUT',
        url: subresourceUrl,
        data: {
          gracePeriod: 0,
        },
      });

      if (!isSchedulingBlocked) {
        this.$dispatch(
          'growl/success',
          {
            title: this.$rootGetters['i18n/t']('kubevirt.notification.title.succeed'),
            message: this.t('kubevirt.notification.forceStopSuccess', { name }),
          },
          { root: true }
        );
      }

      if (isSchedulingBlocked) {
        await patchVmToHalted(this.t('kubevirt.notification.forceStopStartingSuccess', {
          name,
          mode: this.forceStopPatchMode,
        }));
      }
    } catch (stopErr) {
      this.$dispatch(
        'growl/info',
        {
          title: this.$rootGetters['i18n/t']('kubevirt.notification.title.info'),
          message: this.t(
            isSchedulingBlocked ? 'kubevirt.notification.forceStopStartingFallback' : 'kubevirt.notification.forceStopFallback',
            { name }
          ),
        },
        { root: true }
      );

      try {
        await patchVmToHalted(
          isSchedulingBlocked ? this.t('kubevirt.notification.forceStopStartingSuccess', {
            name,
            mode: this.forceStopPatchMode,
          }) : undefined
        );
      } catch (patchErr) {
        this.$dispatch(
          'growl/fromError',
          {
            title: this.$rootGetters['i18n/t']('generic.notification.title.error'),
            err: patchErr.data || patchErr || stopErr.data || stopErr,
          },
          { root: true }
        );
      }
    }
  }

  softrebootVM() {
    this.doVMSubresourceActionGrowl('virtualmachineinstances', 'softreboot');
  }

  pauseVM() {
    this.doVMSubresourceActionGrowl('virtualmachineinstances', 'pause');
  }

  unpauseVM() {
    this.doVMSubresourceActionGrowl('virtualmachineinstances', 'unpause');
  }

  get canStart() {
    // NOTE: based on Harvester backend formatter: https://github.com/harvester/harvester/blob/master/pkg/api/vm/formatter.go#L192
    // and harvester-ui-extension https://github.com/harvester/harvester-ui-extension/blob/main/pkg/harvester/models/kubevirt.io.virtualmachine.js
    return !this.isStarting && !this.isRunning;
  }

  get canStop() {
    return !this.isBeingStopped && this.isRunning;
  }

  get canForceStop() {
    return canForceStopVm({
      isRunning:       this.isRunning,
      isBeingStopped:  this.isBeingStopped,
      isStarting:      this.isStarting,
      printableStatus: this.status?.printableStatus,
    });
  }

  get canSoftReboot() {
    return this.canPause;
  }

  get canPause() {
    return !this.isPaused && this.isRunning;
  }

  get canUnpause() {
    return !this.isRunning && this.isPaused;
  }

  get isMigrating() {
    return isVmMigrating(this.vmi?.status?.migrationState);
  }

  get actualState() {
    if (this.isRestoring) {
      return 'Restoring';
    }

    const migrating = resolveActualStateMigrating({
      migrationInitiatedAt: this._migrationInitiated,
      isMigrating:          this.isMigrating,
    });

    if (migrating.clearInitiated) {
      delete this._migrationInitiated;
    }

    if (migrating.state) {
      return migrating.state;
    }

    return super.actualState;
  }

  /**
   * KubeVirt sets status.restoreInProgress while a VirtualMachineRestore runs.
   * Prefer that over the restore store so list/detail refresh when the VM is watched.
   */
  get kubevirtRestoreInProgressName() {
    return this.status?.restoreInProgress || null;
  }

  /**
   * In-progress snapshot.kubevirt.io VirtualMachineRestore targeting this VM.
   * Used to surface "Restoring" in the UI (Harvester restoreResource uses a different CRD).
   */
  get activeKubevirtRestore() {
    const ns = this.metadata?.namespace;
    const restoreName = this.kubevirtRestoreInProgressName;

    try {
      const inStore = this.productInStore || 'cluster';
      const all = this.$rootGetters[`${ inStore }/all`](VM_RESTORE_RESOURCE_NAME) || [];

      if (restoreName) {
        const byName = all.find((restore) => restore.metadata?.name === restoreName &&
          (restore.metadata?.namespace || ns) === ns);

        if (byName) {
          return byName;
        }

        // Status says restore is running even if the CR is not in the Vuex store yet
        return { metadata: { name: restoreName, namespace: ns } };
      }

      const name = this.metadata?.name;

      return all.find((restore) => {
        const target = restore.spec?.target || {};
        const sameNs = (restore.metadata?.namespace || ns) === ns;
        const sameName = target.name === name;

        return sameNs && sameName && isRestoreInProgress(restore);
      }) || null;
    } catch (e) {
      if (restoreName) {
        return { metadata: { name: restoreName, namespace: ns } };
      }

      return null;
    }
  }

  get isRestoring() {
    return !!this.kubevirtRestoreInProgressName || !!this.activeKubevirtRestore;
  }

  get canMigrate() {
    return !!this.isRunning && !this.isMigrating;
  }

  get canAbortMigration() {
    return this.isMigrating;
  }

  cloneVM() {
    this.$dispatch('promptModal', {
      resources:  [this],
      component: 'KubevirtCloneDialog',
    });
  }

  migrateVM() {
    this.$dispatch('promptModal', {
      resources:  [this],
      component: 'KubevirtMigrateDialog',
    });
  }

  takeSnapshot() {
    this.$dispatch('promptModal', {
      resources:  [this],
      component: 'KubevirtSnapshotDialog',
    });
  }

  async abortMigrationVM() {
    const clusterId = this.$rootGetters['clusterId'];
    const ns        = this.metadata.namespace;
    const name      = this.metadata.name;

    try {
      const res = await this.$dispatch('request', {
        method: 'GET',
        url:    `/k8s/clusters/${ clusterId }/apis/kubevirt.io/v1/namespaces/${ ns }/virtualmachineinstancemigrations`,
      });

      const active = (res?.items || []).find(
        (m) => m.spec?.vmiName === name &&
          !['Failed', 'Succeeded'].includes(m.status?.phase)
      );

      if (active) {
        await this.$dispatch('request', {
          method: 'DELETE',
          url:    `/k8s/clusters/${ clusterId }/apis/kubevirt.io/v1/namespaces/${ ns }/virtualmachineinstancemigrations/${ active.metadata.name }`,
        });
        this.$dispatch(
          'growl/success',
          {
            title:   this.t('kubevirt.notification.migrationAbortedTitle'),
            message: this.t('kubevirt.notification.migrationAborted', { name }),
          },
          { root: true }
        );
      }
    } catch (err) {
      this.$dispatch('growl/fromError', {
        title: this.$rootGetters['i18n/t']('generic.notification.title.error'),
        err,
      }, { root: true });
    }
  }

  get vCPUs() {
    // https://kubevirt.io/user-guide/compute/dedicated_cpu_resources/#requesting-dedicated-cpu-resources
    const vmi = this.$getters['byId'](HCI.VMI, this.id);
    return (
      calculateVCPU(vmi?.spec?.domain?.cpu) ||
      calculateVCPU(this.spec.template?.spec?.domain?.cpu) ||
      this.spec.template?.spec?.domain?.resources?.requests?.cpu ||
      this.spec.template?.spec?.domain?.resources?.limits?.cpu
    );
  }
}
