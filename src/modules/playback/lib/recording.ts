export const DEFAULT_RECORDING_DIRECTORY = 'Movena Recordings';

export interface RecordingOutput {
  fileName: string;
  path: string;
}

export function createRecordingFileName(title: string, now = new Date()): string {
  const safeTitle =
    title
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/g, '')
      .slice(0, 80) || 'Live stream';
  const timestamp = now.toISOString().replace(/[:.]/g, '-');

  return `${safeTitle}_${timestamp}.ts`;
}

export function joinRecordingPath(directory: string, fileName: string): string {
  const resolvedDirectory = directory.trim() || DEFAULT_RECORDING_DIRECTORY;
  const separator =
    resolvedDirectory.includes('\\') && !resolvedDirectory.includes('/') ? '\\' : '/';
  const base = resolvedDirectory.replace(/[\\/]+$/, '');
  return `${base}${separator}${fileName}`;
}

export function createRecordingOutput(
  title: string,
  directory = DEFAULT_RECORDING_DIRECTORY,
  now = new Date(),
): RecordingOutput {
  const fileName = createRecordingFileName(title, now);
  return { fileName, path: joinRecordingPath(directory, fileName) };
}
