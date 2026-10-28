import type { Decorator } from '@storybook/angular';
import { shellStoryDecorators } from './shell-story';
import { provideFakeAnalysisApi, type AnalysisScenario } from './analysis-api';

export interface AnalysisStoryArgs {
  route: '/omniscient';
  scenario: AnalysisScenario;
}

export const analysisStoryDecorators: Decorator<AnalysisStoryArgs>[] = shellStoryDecorators<AnalysisStoryArgs>((args) =>
  provideFakeAnalysisApi(args.scenario),
);

export const analysisScenarioOptions: AnalysisScenario[] = [
  'normal',
  'emptyLibrary',
  'notAnalysed',
  'noLlm',
  'invalidOntology',
  'locked',
  'running',
];
