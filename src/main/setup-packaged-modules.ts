import { app } from 'electron';
import { Module } from 'module';
import path from 'path';

/** Node exposes this at runtime; @types/node omits it on the Module class. */
const globalPaths = (Module as typeof Module & { globalPaths: string[] }).globalPaths;

/** Make extraResource copies under resources/node_modules resolvable when packaged. */
if (app.isPackaged) {
  const resourcesNodeModules = path.join(process.resourcesPath, 'node_modules');
  if (!globalPaths.includes(resourcesNodeModules)) {
    globalPaths.push(resourcesNodeModules);
  }
}
