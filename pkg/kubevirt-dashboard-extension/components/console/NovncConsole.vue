<script>
import RFB from '@novnc/novnc/lib/rfb';
import BrandImage from '@shell/components/BrandImage';

export default {
  components: { BrandImage },

  emits: ['connected', 'disconnected'],

  props: {
    url: {
      type: String,
      default: '',
    },
  },

  data() {
    return {
      rfb: null,
      connected: false,
      disconnected: false,
      connectId: 0,
    };
  },

  mounted() {
    this.$nextTick(() => {
      this.connect();
    });
  },

  beforeUnmount() {
    this.teardown();
  },

  beforeDestroy() {
    this.teardown();
  },

  methods: {
    teardown() {
      this.connectId += 1;

      if (!this.rfb) {
        return;
      }

      try {
        this.rfb.disconnect();
      } catch (e) {
        // ignore
      }

      this.rfb = null;
    },

    connect() {
      if (!this.url || !this.$refs.view) {
        return;
      }

      this.teardown();
      this.$refs.view.innerHTML = '';
      this.connected = false;
      this.disconnected = false;

      const connectId = this.connectId;
      const rfb = new RFB(this.$refs.view, this.url);

      rfb.addEventListener('connect', () => {
        if (connectId !== this.connectId) {
          return;
        }

        this.connected = true;
        this.disconnected = false;
        this.$emit('connected');
      });

      rfb.addEventListener('disconnect', () => {
        if (connectId !== this.connectId) {
          return;
        }

        this.disconnected = true;
        this.$emit('disconnected');
      });

      this.rfb = rfb;
    },

    disconnect() {
      this.teardown();
    },

    reconnect() {
      this.connect();
    },

    ctrlAltDelete() {
      if (this.rfb) {
        this.rfb.sendCtrlAltDel();
      }
    },

    sendKey(keysym, code, down) {
      if (this.rfb) {
        this.rfb.sendKey(keysym, code, down);
      }
    },
  },
};
</script>

<template>
  <div>
    <div v-if="connected && disconnected">
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
    <div ref="view" />
  </div>
</template>

<style lang="scss" scoped>
.error {
  overflow: hidden;

  .row {
    align-items: center;
  }

  h1 {
    font-size: 5rem;
  }

  .desert-landscape {
    img {
      max-width: 100%;
    }
  }
}
</style>
