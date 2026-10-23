import { app, net, protocol } from 'electron';
import { isAbsolute, join, normalize, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { libraryScheme } from '../features/library/library-protocol';

export const appScheme = 'app';
export const appOrigin = `${appScheme}://renderer`;

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: appScheme, privileges: { standard: true, secure: true, supportFetchAPI: true } },
    { scheme: libraryScheme, privileges: { standard: true, secure: true } },
  ]);
}

function rendererRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'renderer')
    : join(app.getAppPath(), '..', 'angular', 'dist', 'browser');
}

export function handleAppProtocol(): void {
  const root: string = rendererRoot();
  protocol.handle(appScheme, async (request: Request): Promise<Response> => {
    const pathname: string = decodeURIComponent(new URL(request.url).pathname);
    const file: string = normalize(join(root, pathname));
    const relativePath: string = relative(root, file);
    if (!relativePath.startsWith('..') && !isAbsolute(relativePath)) {
      const response: Response = await net.fetch(pathToFileURL(file).toString());
      if (response.ok) {
        return response;
      }
    }
    return net.fetch(pathToFileURL(join(root, 'index.html')).toString());
  });
}
