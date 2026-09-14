import { tauriApi } from '@/platform/tauri';

export async function storeProviderPassword(password: string): Promise<void> {
  await tauriApi.credentialStore(password);
}

export async function loadProviderPassword(): Promise<string | null> {
  return tauriApi.credentialLoad();
}

export async function deleteProviderPassword(): Promise<void> {
  await tauriApi.credentialDelete();
}
