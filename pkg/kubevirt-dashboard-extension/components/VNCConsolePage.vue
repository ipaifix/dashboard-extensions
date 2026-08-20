<script>
import { VMI_RESOURCE_NAME, VM_RESOURCE_NAME } from '../constants';
import NovncConsoleWrapper from './console/NovncConsoleWrapper.vue';

const POLL_MS = 1500;

export default {
  components: { NovncConsoleWrapper },

  data() {
    return {
      id: `${ this.$route.params.namespace }/${ this.$route.params.vm }`,
      pollTimer: null,
    };
  },

  async fetch() {
    // Non-blocking for missing VMI; parallel; prefer cache on first load
    await this.refreshResources({ force: false });
  },

  head() {
    return { title: this.vmi?.metadata?.name || this.$route.params.vm };
  },

  computed: {
    vmi() {
      return this.$store.getters['cluster/byId'](VMI_RESOURCE_NAME, this.id) || {};
    },

    vmiReady() {
      return this.vmi?.status?.phase === 'Running';
    },
  },

  watch: {
    vmiReady(ready) {
      if (ready) {
        this.clearPoll();
      } else {
        this.ensurePoll();
      }
    },
  },

  mounted() {
    window.addEventListener('beforeunload', this.handleBeforeUnload);

    if (!this.vmiReady) {
      this.ensurePoll();
    }
  },

  beforeDestroy() {
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    this.clearPoll();
  },

  beforeUnmount() {
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    this.clearPoll();
  },

  methods: {
    handleBeforeUnload() {
      this.$refs.console?.close();
    },

    clearPoll() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    },

    ensurePoll() {
      if (this.pollTimer) {
        return;
      }

      this.pollTimer = setInterval(() => this.refreshResources({ force: true }), POLL_MS);
    },

    async refreshResources({ force = true } = {}) {
      await Promise.all([
        this.$store.dispatch('cluster/find', {
          type: VM_RESOURCE_NAME,
          id:   this.id,
          opt:  { force, watch: true },
        }).catch(() => null),
        this.$store.dispatch('cluster/find', {
          type: VMI_RESOURCE_NAME,
          id:   this.id,
          opt:  { force, watch: true },
        }).catch(() => null),
      ]);
    },
  },
};
</script>

<template>
  <!-- Render immediately — do not wait on fetch / Loading -->
  <NovncConsoleWrapper ref="console" v-model:value="vmi" class="novnc-wrapper" />
</template>

<style>
HTML,
BODY,
MAIN,
#__nuxt,
#__layout,
#app,
.vm-console,
.vm-console > DIV,
.vm-console > DIV > DIV {
  height: 100%;
}
</style>
