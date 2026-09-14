import {
  parseM3u,
  type M3uPlaylist,
  type ParseM3uOptions,
} from '@/modules/sources/public/data/m3uClient';

interface ParseRequest {
  id: number;
  content: string;
  options: Partial<ParseM3uOptions>;
}

interface ParseResponse {
  id: number;
  playlist?: M3uPlaylist | undefined;
  error?: string | undefined;
}

self.addEventListener('message', (event: MessageEvent<ParseRequest>) => {
  const { id, content, options } = event.data;
  try {
    const response: ParseResponse = { id, playlist: parseM3u(content, options) };
    self.postMessage(response);
  } catch (error: unknown) {
    const response: ParseResponse = {
      id,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
});
