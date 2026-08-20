<script>
import ResourceTable from '@shell/components/ResourceTable';
import { STATE, AGE, NAME, NAMESPACE } from '@shell/config/table-headers';

export default {
  name: 'KubevirtVMIList',

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
          name:        'phase',
          label:       'Phase',
          value:       'status.phase',
          dashIfEmpty: true,
        },
        {
          name:        'node',
          label:       'Node',
          value:       'status.nodeName',
          dashIfEmpty: true,
        },
        {
          name:        'ip',
          label:       'IP Address',
          value:       'status.interfaces[0].ipAddress',
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
