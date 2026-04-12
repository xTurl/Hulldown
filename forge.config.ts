import type { ForgeConfig } from '@electron-forge/shared-types';
import fs from 'fs';
import path from 'path';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: '**/*.node',
    },
    icon: path.resolve(__dirname, 'assets/icon'),
    extraResource: [
      'node_modules/better-sqlite3',
      'node_modules/bindings',
      'node_modules/file-uri-to-path',
      'assets/icon.png',
      'assets/icon.ico',
    ],
  },
  rebuildConfig: {
    force: true,
  },
  hooks: {
    postPackage: async (_config, options) => {
      const nativeModules = ['better-sqlite3', 'bindings', 'file-uri-to-path'];
      for (const outputPath of options.outputPaths) {
        const resourcesDir = path.join(outputPath, 'resources');
        const nodeModulesDir = path.join(resourcesDir, 'node_modules');
        fs.mkdirSync(nodeModulesDir, { recursive: true });
        for (const mod of nativeModules) {
          const from = path.join(resourcesDir, mod);
          const to = path.join(nodeModulesDir, mod);
          if (fs.existsSync(from)) {
            fs.renameSync(from, to);
          }
        }
        // Copy app icon so the BrowserWindow icon path always finds it
        const iconSrc = path.join(__dirname, 'assets/icon.png');
        const iconDest = path.join(outputPath, 'hulldown.png');
        if (fs.existsSync(iconSrc) && !fs.existsSync(iconDest)) {
          fs.copyFileSync(iconSrc, iconDest);
        }
      }
    },
  },
  makers: [
    new MakerSquirrel({
      setupIcon: path.resolve(__dirname, 'assets/icon.ico'),
    }),
    new MakerZIP({}, ['darwin']),
    new MakerDeb({ options: { icon: path.resolve(__dirname, 'assets/icon.png') } }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/index.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
