import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { fetch } from 'expo/fetch';
import { Platform } from 'react-native';
import type { Attachment, AttachmentTarget } from './attachments-contract';
import { AuthError, submissionKey, type Grant } from './auth-api';
import { authConfig, frontendPreview } from './auth-config';
import { preview } from './frontend-preview';

const retention = 86_400_000;

export async function openAttachment(target: AttachmentTarget, asset: Attachment, grant: Grant, signal: AbortSignal,
                                     onProgress: (percent: number | null) => void, onReady: () => void) {
  if (!authConfig) throw new AuthError('unavailable');
  if (frontendPreview) {
    const file = preview.attachment(target, asset.kind);
    if (!file) throw new AuthError('not-found');
    if (signal.aborted) throw new AuthError('transport');
    if (Platform.OS === 'web') {
      onReady();
      const anchor = document.createElement('a');
      anchor.href = file.uri;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      try { anchor.click(); } finally { anchor.remove(); }
    } else {
      const source = new File(file.uri);
      await stageAndOpen(source.readableStream(), asset, source.size, signal, () => {}, onProgress, onReady);
    }
    return;
  }
  const endpoint = new URL('projects/attachments/download', authConfig.url);
  const connection = new AbortController();
  const stop = () => connection.abort();
  signal.addEventListener('abort', stop, { once: true });
  if (signal.aborted) stop();
  let timer = setTimeout(stop, 15_000);
  const waitForData = () => {
    clearTimeout(timer);
    timer = setTimeout(stop, 30_000);
  };
  try {
    const response = await fetch(endpoint.href, {
      method: 'POST', credentials: 'omit', redirect: 'error', signal: connection.signal,
      headers: { Accept: asset.mimeType, 'Content-Type': 'application/json', Authorization: 'Bearer ' + grant.sessionToken },
      body: JSON.stringify({ ...target, kind: asset.kind }),
    });
    if (response.url !== endpoint.href) throw new AuthError('bad-response');
    if (response.status === 401) throw new AuthError('expired');
    if (response.status === 403) throw new AuthError('forbidden');
    if (response.status === 404) throw new AuthError('not-found');
    if (!response.ok) throw new AuthError('unavailable');
    const disposition = response.headers.get('content-disposition') ?? '';
    const encoded = /(?:^|;\s*)filename\*=UTF-8''([^;]+)$/i.exec(disposition)?.[1];
    const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!encoded || decodeURIComponent(encoded) !== asset.name || contentType !== asset.mimeType) throw new AuthError('bad-response');
    const size = response.headers.get('content-length');
    const bytes = size === null ? null : Number(size);
    if (bytes !== null && (!/^\d+$/.test(size ?? '') || !Number.isSafeInteger(bytes))) throw new AuthError('bad-response');
    waitForData();
    if (Platform.OS === 'web') {
      const blob = await response.blob();
      if (bytes !== null && blob.size !== bytes) throw new AuthError('bad-response');
      if (connection.signal.aborted) throw new AuthError('transport');
      onReady();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = asset.name;
      document.body.appendChild(anchor);
      try { anchor.click(); }
      finally {
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
    } else {
      await stageAndOpen(response.body, asset, bytes, connection.signal, waitForData, onProgress, () => {
        clearTimeout(timer);
        onReady();
      });
    }
  } catch (error) {
    throw error instanceof AuthError ? error : new AuthError(connection.signal.aborted ? 'transport' : 'unavailable');
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
    stop();
  }
}

async function stageAndOpen(body: ReadableStream<Uint8Array> | null, asset: Attachment, bytes: number | null, signal: AbortSignal,
                            tick: () => void, onProgress: (percent: number | null) => void, onReady: () => void) {
  if (!body) throw new AuthError('bad-response');
  if (!await Sharing.isAvailableAsync()) throw new AuthError('unavailable');

  const cache = new Directory(Paths.cache, 'scm-attachments');
  cache.create({ intermediates: true, idempotent: true });
  const now = Date.now();
  for (const entry of cache.list()) {
    if (entry instanceof Directory && now - Number.parseInt(entry.name.split('-')[0], 36) >= retention) {
      try { entry.delete(); } catch { /* cleanup can retry on the next open */ }
    }
  }
  const folder = new Directory(cache, submissionKey());
  folder.create();
  let handedOff = false;
  try {
    const file = folder.createFile(asset.name, asset.mimeType);
    const writer = file.writableStream().getWriter();
    const reader = body.getReader();
    let received = 0;
    let last = -1;
    try {
      onProgress(bytes ? 0 : null);
      while (true) {
        if (signal.aborted) throw new AuthError('transport');
        const { value, done } = await reader.read();
        if (done) break;
        tick();
        received += value.byteLength;
        if (bytes !== null && received > bytes) throw new AuthError('bad-response');
        await writer.write(value);
        if (bytes) {
          const progress = Math.floor(received / bytes * 20) * 5;
          if (progress !== last) { last = progress; onProgress(progress); }
        }
      }
      if (bytes !== null && received !== bytes) throw new AuthError('bad-response');
      await writer.close();
    } catch (error) {
      await writer.abort().catch(() => {});
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      writer.releaseLock();
      reader.releaseLock();
    }
    if (signal.aborted) throw new AuthError('transport');
    onReady();
    await Sharing.shareAsync(file.uri, { mimeType: asset.mimeType, dialogTitle: asset.name });
    handedOff = true;
  } finally {
    // Android can still be reading the staged file after the chooser opens.
    if (!handedOff && folder.exists) folder.delete();
  }
}
