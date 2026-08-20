<script>
export default {
  name: 'KubevirtCloneDialog',

  props: {
    resources: {
      type:     Array,
      required: true,
    },
  },

  emits: ['close'],

  data() {
    const vmName = this.resources[0]?.metadata?.name || '';

    return {
      newVmName:    `${ vmName }-clone`,
      startCloned:  false,
      cloning:      false,
      apiAvailable: null,
      checkingApi:  true,
      progressMsg:  '',
      error:        null,
    };
  },

  computed: {
    vm() {
      return this.resources[0];
    },
  },

  async mounted() {
    await this.checkCrdAvailability();
  },

  methods: {
    tt(key, params = {}, fallback = '') {
      return this.t(key, params, true) || fallback;
    },

    close() {
      this.$emit('close');
    },

    async checkCrdAvailability() {
      this.checkingApi = true;
      const clusterId  = this.$store.getters['clusterId'];

      try {
        await this.$store.dispatch('cluster/request', {
          method: 'GET',
          url:    `/k8s/clusters/${ clusterId }/apis/clone.kubevirt.io/v1alpha1`,
        });
        this.apiAvailable = true;
      } catch {
        this.apiAvailable = false;
      } finally {
        this.checkingApi = false;
      }
    },

    async clone() {
      this.cloning     = true;
      this.error       = null;
      this.progressMsg = this.tt('kubevirt.modal.cloneVM.progress.creating', {}, 'Creating clone…');

      const clusterId = this.$store.getters['clusterId'];
      const ns        = this.vm.metadata.namespace;
      const sourceName = this.vm.metadata.name;
      const cloneName  = `clone-${ Date.now() }`;

      const body = {
        apiVersion: 'clone.kubevirt.io/v1alpha1',
        kind:       'VirtualMachineClone',
        metadata:   { name: cloneName, namespace: ns },
        spec:       {
          source: { apiGroup: 'kubevirt.io', kind: 'VirtualMachine', name: sourceName },
          target: { apiGroup: 'kubevirt.io', kind: 'VirtualMachine', name: this.newVmName },
        },
      };

      try {
        await this.$store.dispatch('cluster/request', {
          method: 'POST',
          url:    `/k8s/clusters/${ clusterId }/apis/clone.kubevirt.io/v1alpha1/namespaces/${ ns }/virtualmachineclones`,
          data:   body,
        });

        const phase = await this.pollClonePhase(clusterId, ns, cloneName);

        if (phase === 'Succeeded') {
          if (this.startCloned) {
            this.progressMsg = this.tt('kubevirt.modal.cloneVM.progress.starting', {}, 'Starting cloned VM…');
            await this.startClonedVm(clusterId, ns);
          }

          this.$store.dispatch('growl/success', {
            title:   this.tt('kubevirt.modal.cloneVM.message.successTitle', {}, 'Clone succeeded'),
            message: this.tt('kubevirt.modal.cloneVM.message.success', { name: this.newVmName }, `VM "${ this.newVmName }" was cloned successfully.`),
          }, { root: true });

          this.close();
        } else {
          throw new Error(this.tt('kubevirt.modal.cloneVM.message.failed', { phase }, `Clone failed (phase: ${ phase }).`));
        }
      } catch (err) {
        this.error = err?.data?.message || err?.message || String(err);
        this.$store.dispatch('growl/fromError', {
          title: this.tt('kubevirt.modal.cloneVM.message.failedTitle', {}, 'Clone error'),
          err:   this.error,
        }, { root: true });
      } finally {
        this.cloning     = false;
        this.progressMsg = '';
      }
    },

    pollClonePhase(clusterId, ns, cloneName) {
      return new Promise((resolve, reject) => {
        const deadline = Date.now() + 5 * 60 * 1000;
        const waiting = this.tt('kubevirt.modal.cloneVM.progress.waiting', {}, 'pending');
        const interval = setInterval(async() => {
          try {
            const res = await this.$store.dispatch('cluster/request', {
              method: 'GET',
              url:    `/k8s/clusters/${ clusterId }/apis/clone.kubevirt.io/v1alpha1/namespaces/${ ns }/virtualmachineclones/${ cloneName }`,
            });
            const phase = res?.status?.phase;

            this.progressMsg = this.tt(
              'kubevirt.modal.cloneVM.progress.cloningWithPhase',
              { phase: phase || waiting },
              `Cloning… (phase: ${ phase || waiting })`
            );

            if (phase === 'Succeeded' || phase === 'Failed') {
              clearInterval(interval);
              resolve(phase);
            } else if (Date.now() > deadline) {
              clearInterval(interval);
              reject(new Error(this.tt('kubevirt.modal.cloneVM.message.timeout', {}, 'Timeout: cloning took too long.')));
            }
          } catch (err) {
            clearInterval(interval);
            reject(err);
          }
        }, 2000);
      });
    },

    async startClonedVm(clusterId, ns) {
      await this.$store.dispatch('cluster/request', {
        headers: { accept: '*/*' },
        method:  'PUT',
        url:     `/k8s/clusters/${ clusterId }/apis/subresources.kubevirt.io/v1/namespaces/${ ns }/virtualmachines/${ this.newVmName }/start`,
      });
    },
  },
};
</script>

<template>
  <div class="kv-clone-overlay" @click.self="close">
    <div class="kv-clone-dialog">
      <div class="kv-clone-header">
        <h4>
          {{ tt('kubevirt.modal.cloneVM.title', { name: vm.metadata.name }, `Clone VM — ${ vm.metadata.name }`) }}
        </h4>
        <button type="button" class="kv-close-btn" @click="close">
          <i class="icon icon-close" />
        </button>
      </div>

      <div class="kv-clone-body">
        <div v-if="checkingApi" class="kv-center">
          <i class="icon icon-spinner icon-spin" />
          {{ tt('kubevirt.modal.cloneVM.checkingApi', {}, 'Checking clone API…') }}
        </div>

        <template v-else-if="!apiAvailable">
          <div class="banner banner-warning">
            <i class="icon icon-warning mr-5" />
            {{ tt('kubevirt.modal.cloneVM.apiUnavailable', {}, 'The VirtualMachineClone API is not available on this cluster. KubeVirt v1.7+ is required.') }}
          </div>
        </template>

        <template v-else>
          <div v-if="error" class="banner banner-error mb-15">
            <i class="icon icon-warning mr-5" />{{ error }}
          </div>

          <div v-if="cloning" class="kv-center mb-15">
            <i class="icon icon-spinner icon-spin" />
            <span>{{ progressMsg }}</span>
          </div>

          <div class="mb-15">
            <label class="kv-label" for="new-vm-name">
              {{ tt('kubevirt.modal.cloneVM.name', {}, 'New VM Name') }}
            </label>
            <input
              id="new-vm-name"
              v-model="newVmName"
              type="text"
              class="kv-input"
              :disabled="cloning"
              :placeholder="tt('kubevirt.modal.cloneVM.namePlaceholder', {}, 'cloned-vm-name')"
            >
          </div>

          <div class="kv-checkbox-row">
            <input
              id="start-cloned"
              v-model="startCloned"
              type="checkbox"
              :disabled="cloning"
            >
            <label for="start-cloned" class="kv-checkbox-label">
              {{ tt('kubevirt.modal.cloneVM.startAfterCreate', {}, 'Start the cloned VM after creation') }}
            </label>
          </div>
        </template>
      </div>

      <div class="kv-clone-footer">
        <button type="button" class="btn role-secondary" :disabled="cloning" @click="close">
          {{ tt('kubevirt.modal.cloneVM.cancel', {}, 'Cancel') }}
        </button>
        <button
          v-if="apiAvailable"
          type="button"
          class="btn role-primary ml-10"
          :disabled="checkingApi || cloning || !newVmName"
          @click="clone"
        >
          <i v-if="cloning" class="icon icon-spinner icon-spin mr-5" />
          {{ cloning
            ? tt('kubevirt.modal.cloneVM.cloning', {}, 'Cloning…')
            : tt('kubevirt.modal.cloneVM.clone', {}, 'Clone') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.kv-clone-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.kv-clone-dialog {
  background: var(--body-bg, #fff);
  border: 1px solid var(--border);
  border-radius: 6px;
  width: 460px;
  max-width: 95vw;
  display: flex;
  flex-direction: column;
}

.kv-clone-header {
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

.kv-clone-body {
  padding: 20px;
  flex: 1;
}

.kv-clone-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
}

.kv-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--input-label);
  margin-bottom: 6px;
}

.kv-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--body-text);
  font-size: 13px;

  &:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(var(--primary-rgb, 59, 130, 246), 0.2);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.kv-checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;

  input[type='checkbox'] {
    width: 16px;
    height: 16px;
    cursor: pointer;

    &:disabled { cursor: not-allowed; }
  }
}

.kv-checkbox-label {
  font-size: 13px;
  color: var(--body-text);
  cursor: pointer;
}

.kv-center {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--input-label);
}

.banner {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 4px;
  font-size: 13px;

  &.banner-error {
    background: rgba(200, 50, 50, 0.12);
    border: 1px solid var(--error);
    color: var(--error);
  }

  &.banner-warning {
    background: rgba(220, 140, 0, 0.1);
    border: 1px solid var(--warning);
    color: var(--warning);
  }
}
</style>
