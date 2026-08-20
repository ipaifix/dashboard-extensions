<script>
import ResourceTable from '@shell/components/ResourceTable';
import { AGE, NAME, NAMESPACE } from '@shell/config/table-headers';

export default {
  name: 'KubevirtVMSnapshotList',

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
        NAME,
        NAMESPACE,
        {
          name: 'ready',
          label: 'Ready',
          value: 'status.readyToUse',
          dashIfEmpty: true,
        },
        {
          name: 'sourceVm',
          label: 'Source VM',
          value: 'spec.source.name',
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
