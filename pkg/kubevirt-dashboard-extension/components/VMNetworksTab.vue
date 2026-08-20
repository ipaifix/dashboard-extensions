<script>
export default {
  name: 'VMNetworksTab',

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
    networks() {
      const specInterfaces = this.vm.spec?.template?.spec?.domain?.devices?.interfaces || [];
      const specNetworks   = this.vm.spec?.template?.spec?.networks || [];
      const vmiInterfaces  = this.vmi?.status?.interfaces || [];

      return specInterfaces.map((iface) => {
        const network   = specNetworks.find((n) => n.name === iface.name) || {};
        const vmiIface  = vmiInterfaces.find((i) => i.name === iface.name) || {};

        const networkType = network.pod
          ? 'Pod Network (masquerade)'
          : network.multus
            ? `Multus — ${ network.multus.networkName }`
            : '—';

        return {
          name:       iface.name,
          model:      iface.model || 'virtio',
          type:       iface.masquerade ? 'masquerade' : iface.bridge ? 'bridge' : iface.sriov ? 'sriov' : '—',
          network:    networkType,
          macAddress: vmiIface.mac || iface.macAddress || '—',
          ipAddress:  vmiIface.ipAddress || '—',
          ipAddresses: vmiIface.ipAddresses || [],
          interfaceName: vmiIface.interfaceName || '—',
        };
      });
    },
  },
};
</script>

<template>
  <div class="vm-networks">
    <div v-if="!networks.length" class="text-muted p-20">
      No network interfaces configured.
    </div>
    <table v-else class="network-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Model</th>
          <th>Type</th>
          <th>Network</th>
          <th>MAC Address</th>
          <th>IP Address</th>
          <th>Interface</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="net in networks" :key="net.name">
          <td>{{ net.name }}</td>
          <td>{{ net.model }}</td>
          <td>{{ net.type }}</td>
          <td>{{ net.network }}</td>
          <td class="mono">
            {{ net.macAddress }}
          </td>
          <td>
            <div v-if="net.ipAddresses.length > 1">
              <div v-for="ip in net.ipAddresses" :key="ip">
                {{ ip }}
              </div>
            </div>
            <span v-else>{{ net.ipAddress }}</span>
          </td>
          <td>{{ net.interfaceName }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style lang="scss" scoped>
.vm-networks {
  padding: 20px;
}

.network-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th {
    text-align: left;
    padding: 8px 12px;
    border-bottom: 2px solid var(--border);
    color: var(--input-label);
    font-weight: 600;
    white-space: nowrap;
  }

  td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);

    &.mono {
      font-family: monospace;
      font-size: 12px;
    }
  }

  tr:hover td {
    background: var(--body-bg);
  }
}

.text-muted { color: var(--input-label); }
</style>
