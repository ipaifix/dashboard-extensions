<script>
import KeyTable from '@novnc/novnc/lib/input/keysym';
import BrandImage from '@shell/components/BrandImage';
import { VM_RESOURCE_NAME, VMI_RESOURCE_NAME } from '../../constants';
import NovncConsole from './NovncConsole';
import NovncConsoleItem from './NovncConsoleItem';

const SHORT_KEYS = {
  ControlLeft: {
    label: 'Ctrl',
    value: KeyTable.XK_Control_L,
  },
  AltLeft: {
    label: 'Alt',
    value: KeyTable.XK_Alt_L,
  },
};

const FUNCTION_KEYS = {
  Delete: {
    label: 'Del',
    value: KeyTable.XK_Delete,
  },
  PrintScreen: {
    label: 'Print Screen',
    value: KeyTable.XK_Print,
  },
};

const NORMAL_KEYS = {
  KeyN: {
    label: 'N',
    value: KeyTable.XK_n,
  },
  KeyT: {
    label: 'T',
    value: KeyTable.XK_t,
  },
  KeyW: {
    label: 'W',
    value: KeyTable.XK_w,
  },
  KeyY: {
    label: 'Y',
    value: KeyTable.XK_y,
  },
};

const F_KEYS = {
  F1: {
    label: 'F1',
    value: KeyTable.XK_F1,
  },
  F2: {
    label: 'F2',
    value: KeyTable.XK_F2,
  },
  F3: {
    label: 'F3',
    value: KeyTable.XK_F3,
  },
  F4: {
    label: 'F4',
    value: KeyTable.XK_F4,
  },
  F5: {
    label: 'F5',
    value: KeyTable.XK_F5,
  },
  F6: {
    label: 'F6',
    value: KeyTable.XK_F6,
  },
  F7: {
    label: 'F7',
    value: KeyTable.XK_F7,
  },
  F8: {
    label: 'F8',
    value: KeyTable.XK_F8,
  },
  F9: {
    label: 'F9',
    value: KeyTable.XK_F9,
  },
  F10: {
    label: 'F10',
    value: KeyTable.XK_F10,
  },
  F11: {
    label: 'F11',
    value: KeyTable.XK_F11,
  },
  F12: {
    label: 'F12',
    value: KeyTable.XK_F12,
  },
};

export default {
  components: { BrandImage, NovncConsole, NovncConsoleItem },

  props: {
    value: {
      type: Object,
      required: true,
      default: () => {
        return {};
      },
    },
  },

  data() {
    return {
      keysRecord: [],
      vmResource: {},
      shortcutMenuKey: 0,
      shortcutOpen: false,
      consoleKey: 0,
      consoleConnected: false,
    };
  },

  async fetch() {
    await this.refreshVm();
  },

  computed: {
    resourceId() {
      return this.value?.id || `${ this.$route.params.namespace }/${ this.$route.params.vm }`;
    },

    isDown() {
      return this.isEmpty(this.value);
    },

    isVmiReady() {
      return this.value?.status?.phase === 'Running';
    },

    url() {
      if (this.isDown || !this.isVmiReady || !this.value?.getVMIApiPath) {
        return '';
      }

      const ip = `${ window.location.hostname }:${ window.location.port }`;

      return `wss://${ ip }${ this.value.getVMIApiPath }`;
    },

    allKeys() {
      return {
        ...SHORT_KEYS,
        ...FUNCTION_KEYS,
        ...NORMAL_KEYS,
        ...F_KEYS,
      };
    },

    keymap() {
      const out = {
        ...SHORT_KEYS,
        PrintScreen: FUNCTION_KEYS.PrintScreen,
        ...F_KEYS,
      };

      out.AltLeft.keys = { PrintScreen: FUNCTION_KEYS.PrintScreen, ...F_KEYS };
      out.ControlLeft.keys = {
        AltLeft: {
          ...Object.assign(SHORT_KEYS.AltLeft, {}),
          keys: { Delete: FUNCTION_KEYS.Delete },
        },
        ...NORMAL_KEYS,
      };

      return out;
    },

    hasSoftRebootAction() {
      return this.vmResource?.canSoftReboot;
    },

    isStarting() {
      // Harvester isStarting can stay truthy after Running — exclude when already running
      return !!this.vmResource?.isStarting && !this.vmResource?.isRunning;
    },

    isStopping() {
      return (!!this.vmResource?.isStopping || !!this.vmResource?.isBeingStopped) &&
        !this.vmResource?.isRunning;
    },

    // Single power control: Start → Starting… → Stop → Stopping… → Start
    powerButton() {
      if (this.vmResource?.canStop || this.vmResource?.isRunning) {
        return {
          label:     this.t('kubevirt.action.stop'),
          className: 'bg-error',
          disabled:  false,
          action:    'stop',
        };
      }

      if (this.isStopping) {
        return {
          label:     this.t('kubevirt.virtualMachine.detail.console.stoppingBtn'),
          className: 'bg-error',
          disabled:  true,
          action:    null,
        };
      }

      if (this.isStarting) {
        return {
          label:     this.t('kubevirt.virtualMachine.detail.console.startingBtn'),
          className: 'bg-primary',
          disabled:  true,
          action:    null,
        };
      }

      return {
        label:     this.t('kubevirt.action.start'),
        className: 'bg-primary',
        disabled:  !this.vmResource?.canStart,
        action:    'start',
      };
    },
  },

  watch: {
    // VMI Running after Start — remount console to auto-connect
    isVmiReady(ready, wasReady) {
      if (ready && !wasReady) {
        this.consoleConnected = false;
        this.consoleKey += 1;
      } else if (!ready) {
        this.consoleConnected = false;
      }
    },

    isDown(down, wasDown) {
      if (!wasDown && down) {
        this.closeShortcutMenus();
      }
    },

    resourceId: {
      immediate: false,
      handler() {
        this.refreshVm();
      },
    },
  },

  methods: {
    isEmpty(o) {
      if (o === undefined || o === null) {
        return true;
      }

      return Object.keys(o).length === 0;
    },

    async refreshVm() {
      const id = this.resourceId;

      if (!id || id.includes('undefined')) {
        return;
      }

      try {
        this.vmResource = await this.$store.dispatch('cluster/find', {
          type: VM_RESOURCE_NAME,
          id,
          opt:  { force: true, watch: true },
        });
      } catch (e) {
        // ignore
      }
    },

    async refreshVmi() {
      const id = this.resourceId;

      if (!id || id.includes('undefined')) {
        return;
      }

      try {
        await this.$store.dispatch('cluster/find', {
          type: VMI_RESOURCE_NAME,
          id,
          opt:  { force: true, watch: true },
        });
      } catch (e) {
        // VMI may not exist while stopped
      }
    },

    close() {
      this.$refs.novncConsole?.disconnect();
    },

    async reconnect() {
      await Promise.all([this.refreshVm(), this.refreshVmi()]);
      await this.$nextTick();

      // Remount NovncConsole — most reliable reconnect (avoids stale RFB disconnect races)
      if (this.isVmiReady) {
        this.consoleConnected = false;
        this.consoleKey += 1;
      }
    },

    update({ key, pos }) {
      this.keysRecord.splice(pos, this.keysRecord.length - pos, key);
    },

    onShortcutShown(shown) {
      this.shortcutOpen = shown;

      if (!shown) {
        this.keysRecord = [];
        this.shortcutMenuKey += 1;
      }
    },

    closeShortcutMenus() {
      const popover = this.$refs.popover;

      if (typeof popover?.hide === 'function') {
        popover.hide();
      } else if (popover) {
        popover.isOpen = false;
      }

      this.shortcutOpen = false;
      this.keysRecord = [];
      this.shortcutMenuKey += 1;
    },

    onShortcutOutsideClick(e) {
      if (!this.shortcutOpen) {
        return;
      }

      const target = e.target;

      // Keep open when interacting with shortcut menus or the trigger button
      if (target?.closest?.('.v-popper__popper') || target?.closest?.('.combination-keys__container')) {
        return;
      }

      if (this.$refs.popover?.$el?.contains?.(target)) {
        return;
      }

      this.closeShortcutMenus();
    },

    // Send function key, e.g. ALT + F
    sendKeys() {
      this.keysRecord.forEach((key) => {
        this.$refs.novncConsole.sendKey(this.allKeys[key].value, key, true);
      });

      this.keysRecord.reverse().forEach((key) => {
        this.$refs.novncConsole.sendKey(this.allKeys[key].value, key, false);
      });

      this.closeShortcutMenus();
    },

    sendCtrlAltDel() {
      this.$refs.novncConsole?.ctrlAltDelete();
    },

    softReboot() {
      this.vmResource.softrebootVM();
    },

    onPowerClick() {
      if (this.powerButton.action === 'start') {
        this.vmResource?.startVM?.();
        this.refreshVmi();
      } else if (this.powerButton.action === 'stop') {
        this.vmResource?.stopVM?.();
      }
    },
  },

  mounted() {
    document.addEventListener('mousedown', this.onShortcutOutsideClick, true);
  },

  beforeUnmount() {
    document.removeEventListener('mousedown', this.onShortcutOutsideClick, true);
  },

  beforeDestroy() {
    document.removeEventListener('mousedown', this.onShortcutOutsideClick, true);
  },
};
</script>

<template>
  <div id="app">
    <div class="vm-console">
      <div class="combination-keys">
        <template v-if="consoleConnected">
          <VDropdown
            ref="popover"
            placement="top"
            trigger="click"
            :container="false"
            :auto-hide="false"
            @show="shortcutOpen = true"
            @hide="onShortcutShown(false)"
            @update:shown="onShortcutShown"
          >
            <button class="btn btn-sm bg-primary">
              {{ t('kubevirt.virtualMachine.detail.console.shortKeys') }}
            </button>

            <template #popper>
              <novnc-console-item
                :key="shortcutMenuKey"
                :items="keymap"
                :path="keysRecord"
                :pos="0"
                @update="update"
                @sendKeys="sendKeys"
              />
            </template>
          </VDropdown>

          <button class="btn btn-sm bg-primary" @click="sendCtrlAltDel">
            {{ t('kubevirt.virtualMachine.console.sendCtrlAltDel', {}, true) || 'Send Ctrl+Alt+Del' }}
          </button>

          <button v-if="hasSoftRebootAction" class="btn btn-sm bg-primary" @click="softReboot">
            {{ t('kubevirt.action.softreboot') }}
          </button>
        </template>

        <button class="btn btn-sm bg-primary" @click="reconnect">
          {{ t('kubevirt.virtualMachine.detail.console.reconnect') }}
        </button>

        <button
          class="btn btn-sm"
          :class="powerButton.className"
          :disabled="powerButton.disabled"
          @click="onPowerClick"
        >
          {{ powerButton.label }}
        </button>
      </div>

      <NovncConsole
        v-if="url && isVmiReady"
        :key="consoleKey"
        ref="novncConsole"
        :url="url"
        @connected="consoleConnected = true"
        @disconnected="consoleConnected = false"
      />
      <div v-else class="console-disconnected">
        <main class="main-layout error">
          <div class="text-center">
            <BrandImage file-name="error-desert-landscape.svg" width="900" height="300" />
            <h1>
              {{ t('generic.notification.title.warning') }}
            </h1>
            <h2 class="text-secondary mt-20">
              {{ t('vncConsole.error.message') }}
            </h2>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.vm-console {
  height: 100%;
  display: grid;
  grid-template-rows: 30px auto;
}

.combination-keys {
  background: rgb(40, 40, 40);

  :deep(.v-popper__inner) {
    overflow: visible;
  }
}

.console-disconnected {
  .error {
    overflow: hidden;

    h1 {
      font-size: 5rem;
    }
  }
}
</style>
