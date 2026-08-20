const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  canForceStop,
  shouldForceStopFromSchedulingBlock,
  getForceStopPatchData,
  getForceStopPatchMode,
  usesRunStrategyStopPatch,
  isVmMigrating,
  resolveActualStateMigrating,
  isSnapshotReady,
  getRestorePhase,
  getRestoreState,
  getRestoreTimestamp,
  isRestoreInProgress,
  isContainerFallbackError,
  SERIAL_LOG_CONTAINER,
  LOG_SOURCE_SERIAL,
  LOG_SOURCE_FALLBACK,
} = require('./vm-actions');

describe('shouldForceStopFromSchedulingBlock', () => {
  it('is true when isStarting is set', () => {
    assert.equal(shouldForceStopFromSchedulingBlock({ isStarting: true }), true);
  });

  it('is true for Starting / Provisioning / Scheduling printableStatus', () => {
    assert.equal(shouldForceStopFromSchedulingBlock({ printableStatus: 'Starting' }), true);
    assert.equal(shouldForceStopFromSchedulingBlock({ printableStatus: 'Provisioning' }), true);
    assert.equal(shouldForceStopFromSchedulingBlock({ printableStatus: 'Scheduling' }), true);
  });

  it('is false for Running / Stopped', () => {
    assert.equal(shouldForceStopFromSchedulingBlock({ printableStatus: 'Running' }), false);
    assert.equal(shouldForceStopFromSchedulingBlock({ printableStatus: 'Stopped' }), false);
  });
});

describe('force-stop patch Halted vs running=false', () => {
  it('uses Halted when runStrategy is present', () => {
    assert.equal(usesRunStrategyStopPatch({ runStrategy: 'Always' }), true);
    assert.deepEqual(getForceStopPatchData({ runStrategy: 'Always' }), {
      spec: { runStrategy: 'Halted' },
    });
    assert.equal(getForceStopPatchMode({ runStrategy: 'Always' }), 'runStrategy');
  });

  it('uses running=false when only running flag is used', () => {
    assert.equal(usesRunStrategyStopPatch({ running: true }), false);
    assert.deepEqual(getForceStopPatchData({ running: true }), {
      spec: { running: false },
    });
    assert.equal(getForceStopPatchMode({ running: true }), 'running');
  });

  it('treats empty runStrategy string as runStrategy mode', () => {
    assert.equal(usesRunStrategyStopPatch({ runStrategy: '' }), true);
    assert.deepEqual(getForceStopPatchData({ runStrategy: '' }), {
      spec: { runStrategy: 'Halted' },
    });
  });
});

describe('canForceStop', () => {
  it('allows force-stop while Running or Stopping', () => {
    assert.equal(canForceStop({ isRunning: true }), true);
    assert.equal(canForceStop({ isBeingStopped: true }), true);
    assert.equal(canForceStop({ printableStatus: 'Stopping' }), true);
  });

  it('allows force-stop for Starting + Unschedulable paths', () => {
    assert.equal(canForceStop({ isStarting: true }), true);
    assert.equal(canForceStop({ printableStatus: 'Starting' }), true);
    assert.equal(canForceStop({ printableStatus: 'Unschedulable' }), true);
    assert.equal(canForceStop({ printableStatus: 'ErrorUnschedulable' }), true);
  });

  it('denies force-stop when VM is idle/stopped', () => {
    assert.equal(canForceStop({
      isRunning:       false,
      isBeingStopped:  false,
      isStarting:      false,
      printableStatus: 'Stopped',
    }), false);
    assert.equal(canForceStop({ printableStatus: 'Off' }), false);
  });
});

describe('isVmMigrating / actualState Migrating', () => {
  it('returns false without migrationState', () => {
    assert.equal(isVmMigrating(undefined), false);
    assert.equal(isVmMigrating(null), false);
  });

  it('returns false for completed / failed / terminal statuses', () => {
    assert.equal(isVmMigrating({ completed: true }), false);
    assert.equal(isVmMigrating({ failed: true }), false);
    assert.equal(isVmMigrating({ status: 'Failed' }), false);
    assert.equal(isVmMigrating({ status: 'Succeeded' }), false);
  });

  it('returns true for in-progress migrationState', () => {
    assert.equal(isVmMigrating({ status: 'Running' }), true);
    assert.equal(isVmMigrating({ status: 'Scheduling' }), true);
    assert.equal(isVmMigrating({}), true);
  });

  it('keeps Migrating grace window after initiate until migration is observed', () => {
    const now = 100_000;

    assert.deepEqual(resolveActualStateMigrating({
      migrationInitiatedAt: now - 5_000,
      isMigrating:          false,
      now,
    }), { state: 'Migrating', clearInitiated: false });

    assert.deepEqual(resolveActualStateMigrating({
      migrationInitiatedAt: now - 16_000,
      isMigrating:          false,
      now,
    }), { state: null, clearInitiated: true });
  });

  it('returns Migrating and clears initiate flag when migration is active', () => {
    assert.deepEqual(resolveActualStateMigrating({
      migrationInitiatedAt: 1,
      isMigrating:          true,
      now:                  10,
    }), { state: 'Migrating', clearInitiated: true });
  });
});

describe('isSnapshotReady', () => {
  it('is ready when readyToUse is true', () => {
    assert.equal(isSnapshotReady({ status: { readyToUse: true } }), true);
  });

  it('is ready when Ready condition is True', () => {
    assert.equal(isSnapshotReady({
      status: {
        readyToUse: false,
        conditions: [{ type: 'Ready', status: 'True' }],
      },
    }), true);
  });

  it('is not ready otherwise', () => {
    assert.equal(isSnapshotReady(undefined), false);
    assert.equal(isSnapshotReady({ status: {} }), false);
    assert.equal(isSnapshotReady({
      status: {
        conditions: [{ type: 'Ready', status: 'False' }],
      },
    }), false);
  });
});

describe('VirtualMachineRestore status mapping', () => {
  it('maps complete=true to Complete (no phase)', () => {
    assert.equal(getRestorePhase({
      status: { complete: true, restoreTime: '2026-08-20T08:00:00Z' },
    }), 'Complete');
  });

  it('maps Ready=True to Complete', () => {
    assert.equal(getRestorePhase({
      status: {
        conditions: [{ type: 'Ready', status: 'True' }],
      },
    }), 'Complete');
  });

  it('stays InProgress when Ready=True but Progressing=True', () => {
    assert.equal(getRestorePhase({
      status: {
        complete: false,
        conditions: [
          { type: 'Ready', status: 'True' },
          { type: 'Progressing', status: 'True' },
        ],
      },
    }), 'InProgress');
  });

  it('maps complete string "true" to Complete', () => {
    assert.equal(getRestorePhase({ status: { complete: 'true' } }), 'Complete');
    assert.equal(getRestorePhase({ status: { complete: 'True' } }), 'Complete');
  });

  it('maps Failure=True / error to Failed', () => {
    assert.equal(getRestorePhase({
      status: {
        conditions: [{ type: 'Failure', status: 'True', message: 'boom' }],
      },
    }), 'Failed');
    assert.equal(getRestorePhase({
      status: { error: { message: 'boom' } },
    }), 'Failed');
  });

  it('maps missing complete/conditions to InProgress', () => {
    assert.equal(getRestorePhase({ status: {} }), 'InProgress');
    assert.equal(getRestorePhase({
      status: {
        complete: false,
        conditions: [{ type: 'Ready', status: 'False' }],
      },
    }), 'InProgress');
    assert.equal(isRestoreInProgress({ status: {} }), true);
  });

  it('honors legacy status.phase when present', () => {
    assert.equal(getRestorePhase({ status: { phase: 'Succeeded' } }), 'Complete');
    assert.equal(getRestorePhase({ status: { phase: 'Failed' } }), 'Failed');
  });

  it('getRestoreState marks terminal outcomes', () => {
    assert.deepEqual(getRestoreState({ phase: 'Complete' }), { done: true, failed: false });
    assert.deepEqual(getRestoreState('Succeeded'), { done: true, failed: false });
    assert.deepEqual(getRestoreState({ phase: 'Failed' }), { done: true, failed: true });
    assert.deepEqual(getRestoreState({ phase: 'InProgress' }), { done: false, failed: false });
  });

  it('prefers restoreTime over creationTimestamp', () => {
    assert.equal(getRestoreTimestamp({
      metadata: { creationTimestamp: '2026-08-20T07:00:00Z' },
      status:   { restoreTime: '2026-08-20T08:00:00Z' },
    }), '2026-08-20T08:00:00Z');
    assert.equal(getRestoreTimestamp({
      metadata: { creationTimestamp: '2026-08-20T07:00:00Z' },
      status:   {},
    }), '2026-08-20T07:00:00Z');
  });
});

describe('guest-console-log source fallback helpers', () => {
  it('exposes serial container / source constants', () => {
    assert.equal(SERIAL_LOG_CONTAINER, 'guest-console-log');
    assert.equal(LOG_SOURCE_SERIAL, 'serial');
    assert.equal(LOG_SOURCE_FALLBACK, 'fallback');
  });

  it('treats 400/404 as fallback-eligible container errors', () => {
    assert.equal(isContainerFallbackError({ status: 400 }), true);
    assert.equal(isContainerFallbackError({ status: 404 }), true);
    assert.equal(isContainerFallbackError({ response: { status: 404 } }), true);
    assert.equal(isContainerFallbackError({ status: 500 }), false);
    assert.equal(isContainerFallbackError({}), false);
  });
});
