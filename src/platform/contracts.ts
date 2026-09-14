/** Raw payload emitted by the native download manager. Domain normalization
 * happens in the downloads module after this platform boundary. */
export interface DownloadStatusEvent {
  id: unknown;
  state: unknown;
  downloadedBytes?: unknown | undefined;
  totalBytes?: unknown | undefined;
  path?: unknown | undefined;
  error?: unknown | undefined;
}
