export const PRODUCT_NAME = 'kubevirt';
export const VM_RESOURCE_NAME = 'kubevirt.io.virtualmachine';
export const VMI_RESOURCE_NAME = 'kubevirt.io.virtualmachineinstance';
export const KUBEVIRT_RESOURCE_NAME = 'kubevirt.io.kubevirt';
export const VM_SNAPSHOT_RESOURCE_NAME = 'snapshot.kubevirt.io.virtualmachinesnapshot';
export const VM_RESTORE_RESOURCE_NAME = 'snapshot.kubevirt.io.virtualmachinerestore';
export const VM_MIGRATION_RESOURCE_NAME = 'kubevirt.io.virtualmachineinstancemigration';

/** Set by virt-handler on nodes that can host VMIs. */
export const NODE_SCHEDULABLE_LABEL = 'kubevirt.io/schedulable';
