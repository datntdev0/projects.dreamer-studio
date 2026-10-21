import { dirname, parse } from 'node:path';
import { CheckOutcome } from '@dreamer/shared/models/diagnostics';
import { freeBytes, probeWritable } from '../../storage/folder-probe';
import { CheckContext } from './self-check';
import { SelfCheckEngine } from './self-check-engine';

const MB: number = 1024 * 1024;
const diskErrorBelowBytes: number = 100 * MB;
const diskWarningBelowBytes: number = 1024 * MB;

function driveOf(path: string): string {
  const root: string = parse(path).root;
  return root === '/' ? root : root.replace(/[\\/]+$/, '');
}

async function checkAppData(ctx: CheckContext): Promise<CheckOutcome> {
  const params: { path: string } = { path: ctx.paths.root };
  if (probeWritable(ctx.paths.root)) {
    return { status: 'ok', messageKey: 'diagnostics.check.storage.appData.ok', fixKey: null, params };
  }
  return {
    status: 'error',
    messageKey: 'diagnostics.check.storage.appData.error',
    fixKey: 'diagnostics.check.storage.appData.fix',
    params,
  };
}

async function checkSettingsDir(ctx: CheckContext): Promise<CheckOutcome> {
  const params: { path: string } = { path: dirname(ctx.paths.settingsFile) };
  if (probeWritable(params.path)) {
    return { status: 'ok', messageKey: 'diagnostics.check.storage.settingsDir.ok', fixKey: null, params };
  }
  return {
    status: 'error',
    messageKey: 'diagnostics.check.storage.settingsDir.error',
    fixKey: 'diagnostics.check.storage.settingsDir.fix',
    params,
  };
}

async function checkDiskSpace(ctx: CheckContext): Promise<CheckOutcome> {
  const free: number | null = freeBytes(ctx.paths.root);
  const drive: string = driveOf(ctx.paths.root);
  if (free === null) {
    return {
      status: 'warning',
      messageKey: 'diagnostics.check.storage.diskSpace.unknown',
      fixKey: 'diagnostics.check.storage.diskSpace.unknownFix',
      params: { drive },
    };
  }
  const params: { drive: string; free: number } = { drive, free };
  if (free < diskErrorBelowBytes) {
    return {
      status: 'error',
      messageKey: 'diagnostics.check.storage.diskSpace.error',
      fixKey: 'diagnostics.check.storage.diskSpace.fix',
      params,
    };
  }
  if (free < diskWarningBelowBytes) {
    return {
      status: 'warning',
      messageKey: 'diagnostics.check.storage.diskSpace.warning',
      fixKey: 'diagnostics.check.storage.diskSpace.fix',
      params,
    };
  }
  return { status: 'ok', messageKey: 'diagnostics.check.storage.diskSpace.ok', fixKey: null, params };
}

async function checkIntegrity(ctx: CheckContext): Promise<CheckOutcome> {
  return ctx.checkDatabase();
}

async function checkBackend(ctx: CheckContext): Promise<CheckOutcome> {
  if (ctx.backend === 'starting') {
    return {
      status: 'warning',
      messageKey: 'diagnostics.check.backend.reachable.warning',
      fixKey: 'diagnostics.check.backend.reachable.warningFix',
    };
  }
  if (ctx.backend === 'running' && (await ctx.pingBackend())) {
    return { status: 'ok', messageKey: 'diagnostics.check.backend.reachable.ok', fixKey: null };
  }
  return {
    status: 'error',
    messageKey: 'diagnostics.check.backend.reachable.error',
    fixKey: 'diagnostics.check.backend.reachable.fix',
  };
}

async function checkSettingsFile(ctx: CheckContext): Promise<CheckOutcome> {
  const { notice, invalid } = ctx.settings;
  if (notice === 'invalidFields') {
    return {
      status: 'warning',
      messageKey: 'diagnostics.check.settings.file.warning',
      fixKey: 'diagnostics.check.settings.file.fix',
      params: { fields: invalid.join(', ') },
    };
  }
  if (notice === 'unreadable') {
    return {
      status: 'error',
      messageKey: 'diagnostics.check.settings.file.error',
      fixKey: 'diagnostics.check.settings.file.fix',
    };
  }
  return { status: 'ok', messageKey: 'diagnostics.check.settings.file.ok', fixKey: null };
}

export function registerBuiltInChecks(engine: SelfCheckEngine): void {
  engine.register({
    id: 'storage.appData',
    category: 'storage',
    nameKey: 'diagnostics.check.storage.appData.name',
    run: checkAppData,
  });
  engine.register({
    id: 'storage.settingsDir',
    category: 'storage',
    nameKey: 'diagnostics.check.storage.settingsDir.name',
    run: checkSettingsDir,
  });
  engine.register({
    id: 'storage.diskSpace',
    category: 'storage',
    nameKey: 'diagnostics.check.storage.diskSpace.name',
    run: checkDiskSpace,
  });
  engine.register({
    id: 'database.integrity',
    category: 'database',
    nameKey: 'diagnostics.check.database.integrity.name',
    run: checkIntegrity,
  });
  engine.register({
    id: 'backend.reachable',
    category: 'backend',
    nameKey: 'diagnostics.check.backend.reachable.name',
    run: checkBackend,
  });
  engine.register({
    id: 'settings.file',
    category: 'settings',
    nameKey: 'diagnostics.check.settings.file.name',
    run: checkSettingsFile,
  });
}
