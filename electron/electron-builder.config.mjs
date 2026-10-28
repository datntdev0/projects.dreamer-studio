import { readAppVersion } from './esbuild.mjs';

export default {
  appId: 'dev.datnt.dreamer-studio',
  productName: 'Dreamer Studio',
  executableName: 'DreamerStudio',
  artifactName: 'DreamerStudio-${version}-${os}-${arch}.${ext}',
  extraMetadata: { version: readAppVersion() },
  directories: { output: '../.output' },
  files: ['dist/**', 'package.json'],
  extraResources: [
    { from: '../angular/dist/browser', to: 'renderer' },
    { from: '../backend/dist/dreamer-backend', to: 'backend' },
    { from: 'main/storage/migrations', to: 'migrations' },
    { from: 'resources/ontology.format.yml', to: 'ontology.format.yml' },
  ],
  win: {
    icon: 'resources/icon.ico',
    target: [{ target: 'zip', arch: ['x64'] }],
    extraResources: [{ from: 'resources/icon.ico', to: 'icon.ico' }],
  },
  linux: {
    icon: 'resources/icon.png',
    category: 'Graphics',
    target: [{ target: 'AppImage', arch: ['x64'] }],
    extraResources: [{ from: 'resources/icon.png', to: 'icon.png' }],
  },
};
