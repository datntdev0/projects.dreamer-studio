import { runBackendJob } from '../backend/backend-job';
import { PipelineDefinition, PipelineStep, sleep, StepContext } from './pipeline-definition';

const stepCount: number = 5;
const backendStep: number = 3;
const ticks: number = 10;
const defaultTickMs: number = 300;

function tickMs(): number {
  const value: number = Number(process.env.DREAMER_DEMO_TICK_MS);
  return Number.isFinite(value) && value > 0 ? value : defaultTickMs;
}

async function runTicks(n: number, ctx: StepContext): Promise<void> {
  ctx.log.info(`Demo step ${n} started`);
  for (let tick: number = 1; tick <= ticks; tick++) {
    await sleep(tickMs(), ctx.signal);
    ctx.progress(tick * 10);
    if (tick === ticks / 2 && ctx.params.failAtStep === n) {
      throw new Error(`Demo failure at step ${n}`);
    }
  }
}

function buildStep(n: number): PipelineStep {
  const isBackend: boolean = n === backendStep;
  return {
    key: `run.demo.step.${n}`,
    backend: isBackend,
    run: (ctx: StepContext): Promise<void> =>
      isBackend
        ? runBackendJob('demo', { ticks, tickMs: tickMs(), fail: ctx.params.failAtStep === n }, ctx)
        : runTicks(n, ctx),
  };
}

export const demoPipeline: PipelineDefinition = {
  type: 'demo',
  steps: Array.from({ length: stepCount }, (_: unknown, index: number) => buildStep(index + 1)),
};
