import { IDownloadAdapter } from './adapter';
import { DesktopDownloadAdapter } from './desktop-adapter';
import { WebDownloadAdapter } from './web-adapter';

export * from './types';
export * from './adapter';
export * from './desktop-adapter';
export * from './web-adapter';

function createDownloadService(): IDownloadAdapter {
  if (typeof window !== 'undefined' && window.labDesktopAPI) {
    return new DesktopDownloadAdapter();
  }
  return new WebDownloadAdapter();
}

export const downloadService: IDownloadAdapter = createDownloadService();
