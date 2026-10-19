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
    { from: 'main/storage/migrations', to: 'migrations' },
    { from: 'resources/icon.ico', to: 'icon.ico' },
  ],
  win: { icon: 'resources/icon.ico', target: [{ target: 'zip', arch: ['x64'] }] },
};
