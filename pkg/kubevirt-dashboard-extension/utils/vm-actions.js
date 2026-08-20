/**
 * Pure helpers for critical VM actions (force-stop, migration, snapshot restore, logs).
 * Kept free of Vue/Rancher runtime so unit tests can run with Node's built-in test runner.
 */

const SCHEDULING_BLOCK_STATUSES = ['Starting', 'Provisioning', 'Scheduling'];
const FORCE_STOP_EXTRA_STATUSES = ['Stopping', 'Unschedulable', 'ErrorUnschedulable'];
const MIGRATION_TERMINAL_STATUSES = ['Failed', 'Succeeded'];

const SERIAL_LOG_CONTAINER = 'guest-console-log';
const LOG_SOURCE_SERIAL = 'serial';
const LOG_SOURCE_FALLBACK = 'fallback';

function shouldForceStopFromSchedulingBlock({ isStarting, printableStatus } = {}) {
  return !!isStarting || SCHEDULING_BLOCK_STATUSES.includes(printableStatus);
}

function usesRunStrategyStopPatch(spec) {
  return spec?.runStrategy !== undefined;
}

function getForceStopPatchData(spec) {
  return usesRunStrategyStopPatch(spec)
    ? { spec: { runStrategy: 'Halted' } }
    : { spec: { running: false } };
}

function getForceStopPatchMode(spec) {
  return usesRunStrategyStopPatch(spec) ? 'runStrategy' : 'running';
}

function canForceStop({
  isRunning,
  isBeingStopped,
  isStarting,
  printableStatus,
} = {}) {
  return !!isRunning ||
    !!isBeingStopped ||
    shouldForceStopFromSchedulingBlock({ isStarting, printableStatus }) ||
    FORCE_STOP_EXTRA_STATUSES.includes(printableStatus);
}

function isVmMigrating(migrationState) {
  if (!migrationState) {
    return false;
  }

  if (migrationState.completed || migrationState.failed) {
    return false;
  }

  if (MIGRATION_TERMINAL_STATUSES.includes(migrationState.status)) {
    return false;
  }

  return true;
}

function resolveActualStateMigrating({
  migrationInitiatedAt,
  isMigrating,
  now = Date.now(),
  graceMs = 15000,
} = {}) {
  if (migrationInitiatedAt && !isMigrating) {
    if (now - migrationInitiatedAt < graceMs) {
      return { state: 'Migrating', clearInitiated: false };
    }

    return { state: null, clearInitiated: true };
  }

  if (isMigrating) {
    return { state: 'Migrating', clearInitiated: true };
  }

  return { state: null, clearInitiated: false };
}

function isSnapshotReady(snapshot) {
  if (snapshot?.status?.readyToUse === true) {
    return true;
  }

  const conditions = Array.isArray(snapshot?.status?.conditions) ? snapshot.status.conditions : [];
  const readyCondition = conditions.find((c) => c?.type === 'Ready');

  return readyCondition?.status === 'True';
}

/**
 * KubeVirt VirtualMachineRestore often has no status.phase.
 * Success: status.complete === true | Ready=True | legacy phase Complete/Succeeded
 * Failure: Failure=True | status.error | legacy phase Failed/Error
 * Otherwise: InProgress
 */
function getRestoreCondition(status, type) {
  const conditions = Array.isArray(status?.conditions) ? status.conditions : [];

  return conditions.find((c) => c?.type === type);
}

function getRestorePhase(restore) {
  if (!restore) {
    return null;
  }

  const status = restore.status || {};
  const phase = status.phase;

  if (['Failed', 'Error'].includes(phase)) {
    return 'Failed';
  }

  const failureCondition = getRestoreCondition(status, 'Failure');

  if (failureCondition?.status === 'True' || status.error) {
    return 'Failed';
  }

  if (['Complete', 'Completed', 'Succeeded', 'Success'].includes(phase)) {
    return 'Complete';
  }

  // Steve / YAML may surface complete as boolean or string
  if (status.complete === true || status.complete === 'true' || status.complete === 'True') {
    return 'Complete';
  }

  const readyCondition = getRestoreCondition(status, 'Ready');

  // Ready=True alone is not enough while Progressing=True (PVC still cloning)
  const progressingCondition = getRestoreCondition(status, 'Progressing');

  if (readyCondition?.status === 'True' && progressingCondition?.status !== 'True') {
    return 'Complete';
  }

  return 'InProgress';
}

function getRestoreState(entry) {
  const phase = typeof entry === 'string' ? entry : entry?.phase;

  if (['Complete', 'Completed', 'Succeeded', 'Success'].includes(phase)) {
    return { done: true, failed: false };
  }

  if (['Failed', 'Error'].includes(phase)) {
    return { done: true, failed: true };
  }

  return { done: false, failed: false };
}

function getRestoreTimestamp(restore) {
  return restore?.status?.restoreTime || restore?.metadata?.creationTimestamp || null;
}

function isRestoreInProgress(restore) {
  return getRestorePhase(restore) === 'InProgress';
}

function isContainerFallbackError(err) {
  const status = err?.status || err?.response?.status;

  return status === 400 || status === 404;
}

module.exports = {
  SCHEDULING_BLOCK_STATUSES,
  FORCE_STOP_EXTRA_STATUSES,
  SERIAL_LOG_CONTAINER,
  LOG_SOURCE_SERIAL,
  LOG_SOURCE_FALLBACK,
  shouldForceStopFromSchedulingBlock,
  usesRunStrategyStopPatch,
  getForceStopPatchData,
  getForceStopPatchMode,
  canForceStop,
  isVmMigrating,
  resolveActualStateMigrating,
  isSnapshotReady,
  getRestorePhase,
  getRestoreState,
  getRestoreTimestamp,
  isRestoreInProgress,
  isContainerFallbackError,
};
