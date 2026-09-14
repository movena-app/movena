import type { M3uPlaylist } from '@/modules/sources/public/data/m3uClient';
import type { M3uRawEditorViewState } from './M3uRawCodeEditor';

export type EditorMode = 'channels' | 'groups' | 'diagnostics' | 'raw';
export type PlaylistSnapshot = Pick<
  M3uPlaylist,
  'name' | 'epgUrls' | 'entries' | 'warnings' | 'extraHeaderAttributes' | 'extraDirectives'
>;
export type PendingAction =
  | { type: 'source'; sourceId: string }
  | { type: 'close' }
  | { type: 'mode'; mode: EditorMode }
  | { type: 'open-file' }
  | { type: 'load-url' };

export const emptyPlaylist = (): PlaylistSnapshot => ({ entries: [], epgUrls: [], warnings: [] });
export const emptyRawEditorViewState = (): M3uRawEditorViewState => ({
  selectionStart: 0,
  selectionEnd: 0,
  scrollTop: 0,
  scrollLeft: 0,
});
export const legacyDraftKey = (sourceId: string) => `movena-m3u-editor-draft-v1:${sourceId}`;

export function playlistSnapshot(playlist: M3uPlaylist): PlaylistSnapshot {
  return {
    ...(playlist.name !== undefined ? { name: playlist.name } : {}),
    epgUrls: playlist.epgUrls || [],
    entries: playlist.entries || [],
    warnings: playlist.warnings || [],
    ...(playlist.extraHeaderAttributes !== undefined
      ? { extraHeaderAttributes: playlist.extraHeaderAttributes }
      : {}),
    ...(playlist.extraDirectives !== undefined
      ? { extraDirectives: playlist.extraDirectives }
      : {}),
  };
}
