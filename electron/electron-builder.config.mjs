import { readAppVersion } from './esbuild.mjs';

export default {
  appId: 'dev.datnt.dreamer-studio',
  productName: 'Dreamer Studio',
  executableName: 'DreamerStudio',
  artifactName: 'DreamerStudio-${version}-win-x64.${ext}',
  extraMetadata: { version: readAppVersion() },
  directories: { output: '../dist' },
  files: ['dist/**', 'package.json'],
  extraResources: [
    { from: '../angular/dist/browser', to: 'renderer' },
    { from: '../backend/dist/dreamer-backend', to: 'backend' },
  ],
  win: { target: [{ target: 'zip', arch: ['x64'] }] },
};
