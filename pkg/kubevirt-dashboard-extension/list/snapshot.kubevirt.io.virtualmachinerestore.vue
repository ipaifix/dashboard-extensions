<script>
import ResourceTable from '@shell/components/ResourceTable';
import { STATE, AGE, NAME, NAMESPACE } from '@shell/config/table-headers';

export default {
  name: 'KubevirtVMRestoreList',

  components: { ResourceTable },

  props: {
    schema: {
      type:     Object,
      required: true,
    },
  },

  computed: {
    rows() {
      return this.$store.getters['cluster/all'](this.schema.id) || [];
    },

    headers() {
      return [
        STATE,
        NAME,
        NAMESPACE,
        {
          name:        'sourceVm',
          label:       'Source VM',
          value:       'spec.target.name',
          dashIfEmpty: true,
        },
        {
          name:        'sourceSnapshot',
          label:       'Source Snapshot',
          value:       'spec.virtualMachineSnapshotName',
          dashIfEmpty: true,
        },
        {
          name:        'phase',
          label:       'Phase',
          value:       'status.phase',
          dashIfEmpty: true,
        },
        {
          ...AGE,
          sort: 'metadata.creationTimestamp:desc',
        },
      ];
    },
  },
};
</script>

<template>
  <ResourceTable
    v-bind="$attrs"
    :schema="schema"
    :rows="rows"
    :headers="headers"
    default-sort-by="age"
    key-field="_key"
  />
</template>
