<script>
import { formatSi, parseSi } from '@shell/utils/units';

export default {
  name: 'VMDisksTab',

  props: {
    vm: {
      type:     Object,
      required: true,
    },
    pvcs: {
      type:    Array,
      default: () => [],
    },
  },

  computed: {
    disks() {
      const specDisks   = this.vm.spec?.template?.spec?.domain?.devices?.disks || [];
      const specVolumes = this.vm.spec?.template?.spec?.volumes || [];

      return specDisks.map((disk) => {
        const volume = specVolumes.find((v) => v.name === disk.name) || {};
        const pvcName = volume.persistentVolumeClaim?.claimName || null;
        const pvc     = pvcName
          ? this.pvcs.find(
            (p) => p.metadata?.name === pvcName &&
                p.metadata?.namespace === this.vm.metadata?.namespace
          )
          : null;

        return {
          name:         disk.name,
          bus:          disk.disk?.bus || disk.cdrom?.bus || '—',
          type:         disk.cdrom ? 'CD-ROM' : 'Disk',
          bootOrder:    disk.bootOrder || '—',
          pvcName:      pvcName || (volume.containerDisk ? 'Container disk' : (volume.cloudInitNoCloud || volume.cloudInitConfigDrive ? 'cloud-init' : '—')),
          storageClass: pvc?.spec?.storageClassName || '—',
          capacity:     this.formatCapacity(pvc?.spec?.resources?.requests?.storage),
          accessMode:   pvc?.spec?.accessModes?.[0] || '—',
          phase:        pvc?.status?.phase || (pvcName ? 'Unknown' : '—'),
        };
      });
    },
  },

  methods: {
    formatCapacity(raw) {
      if (!raw) return '—';
      try {
        return formatSi(parseSi(raw), {
          increment:   1024,
          addSuffix:   true,
          maxExponent: 3,
          minExponent: 3,
          suffix:      'i',
        });
      } catch {
        return raw;
      }
    },
  },
};
</script>

<template>
  <div class="vm-disks">
    <div v-if="!disks.length" class="text-muted p-20">
      No disks configured.
    </div>
    <table v-else class="disk-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Bus</th>
          <th>Boot Order</th>
          <th>Volume / PVC</th>
          <th>Storage Class</th>
          <th>Capacity</th>
          <th>Access Mode</th>
          <th>Phase</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="disk in disks" :key="disk.name">
          <td>{{ disk.name }}</td>
          <td>{{ disk.type }}</td>
          <td>{{ disk.bus }}</td>
          <td>{{ disk.bootOrder }}</td>
          <td>{{ disk.pvcName }}</td>
          <td>{{ disk.storageClass }}</td>
          <td>{{ disk.capacity }}</td>
          <td>{{ disk.accessMode }}</td>
          <td>
            <span :class="disk.phase === 'Bound' ? 'text-success' : 'text-muted'">
              {{ disk.phase }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style lang="scss" scoped>
.vm-disks {
  padding: 20px;
}

.disk-table {
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
  }

  tr:hover td {
    background: var(--body-bg);
  }
}

.text-success { color: var(--success); }
.text-muted   { color: var(--input-label); }
</style>
