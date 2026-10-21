import { PipelineStepInfo, PipelineTypeInfo } from '@dreamer/shared/models/pipeline';
import { PipelineDefinition, PipelineStep } from './pipeline-definition';

export class PipelineRegistry {
  constructor(private readonly definitions: PipelineDefinition[]) {}

  get(type: string): PipelineDefinition | undefined {
    return this.definitions.find((definition: PipelineDefinition): boolean => definition.type === type);
  }

  types(): PipelineTypeInfo[] {
    return this.definitions.map((definition: PipelineDefinition): PipelineTypeInfo => ({
      type: definition.type,
      steps: definition.steps.map((step: PipelineStep): PipelineStepInfo => ({ key: step.key, backend: step.backend })),
    }));
  }
}
