<script>
import ResourceTable from '@shell/components/ResourceTable';
import { STATE, AGE, NAME, NAMESPACE } from '@shell/config/table-headers';

export default {
  name: 'KubevirtVMMigrationList',

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
          name:        'vmiName',
          label:       'VMI',
          value:       'spec.vmiName',
          dashIfEmpty: true,
        },
        {
          name:        'phase',
          label:       'Phase',
          value:       'status.phase',
          dashIfEmpty: true,
        },
        {
          name:        'sourceNode',
          label:       'Source Node',
          value:       'status.migrationState.sourceNode',
          dashIfEmpty: true,
        },
        {
          name:        'targetNode',
          label:       'Target Node',
          value:       'status.migrationState.targetNode',
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
