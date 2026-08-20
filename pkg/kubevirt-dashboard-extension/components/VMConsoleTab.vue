<script>
import { PRODUCT_NAME } from '../constants';

export default {
  name: 'VMConsoleTab',

  props: {
    vm: {
      type:     Object,
      required: true,
    },
    vmi: {
      type:    Object,
      default: null,
    },
  },

  computed: {
    isRunning() {
      return this.vm.actualState === 'Running';
    },

    clusterId() {
      return this.$store.getters['clusterId'];
    },

    namespace() {
      return this.vm.metadata?.namespace;
    },

    name() {
      return this.vm.metadata?.name;
    },
  },

  methods: {
    openVNC() {
      const route = this.$router.resolve({
        name:   `kubevirt-c-cluster-vm-vncconsole`,
        params: {
          product:   PRODUCT_NAME,
          cluster:   this.clusterId,
          namespace: this.namespace,
          vm:        this.name,
        },
      });

      window.open(route.href, `${ this.name }-vnc`, 'width=1280,height=800,resizable=yes');
    },

    openSerial() {
      const route = this.$router.resolve({
        name:   `kubevirt-c-cluster-vm-serialconsole`,
        params: {
          product:   PRODUCT_NAME,
          cluster:   this.clusterId,
          namespace: this.namespace,
          vm:        this.name,
        },
      });

      window.open(route.href, `${ this.name }-serial`, 'width=1024,height=600,resizable=yes');
    },
  },
};
</script>

<template>
  <div class="vm-console-tab">
    <div v-if="!isRunning" class="banner banner-info">
      <i class="icon icon-info mr-10" />
      {{ t('kubevirt.virtualMachine.detail.console.down') }}
    </div>
    <div v-else class="console-actions">
      <p class="mb-20 text-muted">
        Open a console connection to the virtual machine in a new window.
      </p>
      <div class="console-buttons">
        <button class="btn role-primary mr-10" @click="openVNC">
          <i class="icon icon-monitor mr-5" />
          {{ t('kubevirt.virtualMachine.console.novnc') }}
        </button>
        <button class="btn role-secondary" @click="openSerial">
          <i class="icon icon-terminal mr-5" />
          {{ t('kubevirt.virtualMachine.console.serial') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.vm-console-tab {
  padding: 20px;
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
}

.console-buttons {
  display: flex;
  align-items: center;
}

.text-muted { color: var(--input-label); }
.mr-10 { margin-right: 10px; }
</style>
