import { app } from 'electron';
import { Module } from 'module';
import path from 'path';

/** Make extraResource copies under resources/node_modules resolvable when packaged. */
if (app.isPackaged) {
  const resourcesNodeModules = path.join(process.resourcesPath, 'node_modules');
  if (!Module.globalPaths.includes(resourcesNodeModules)) {
    Module.globalPaths.push(resourcesNodeModules);
  }
}
