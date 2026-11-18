import type { DocumentPickerAsset } from 'expo-document-picker';
import { File } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { Platform } from 'react-native';
import { AuthError, type Grant } from './auth-api';
import { authConfig, frontendPreview } from './auth-config';
import { preview } from './frontend-preview';
import { decodeScheduledKickoff, kickoffMaxFile, validKickoffFilename, type KickoffDraft } from './kickoff-contract';

function selectedFile(asset: DocumentPickerAsset) {
  if (!validKickoffFilename(asset.name)) throw new AuthError('invalid-kickoff-file');
  try {
    if (Platform.OS === 'web') {
      if (!asset.file || asset.file.size < 1 || asset.file.size > kickoffMaxFile) throw new Error();
      return asset.file;
    }
    const source = new File(asset.uri);
    if (source.size < 1 || source.size > kickoffMaxFile) throw new Error();
    // Picker cache URIs use generated names. Expo fetch accepts Blob-compatible files,
    // so preserve the chosen name without copying or eagerly loading another 10 MiB.
    const part: Blob & { name: string } = {
      name: asset.name, size: source.size, type: asset.mimeType || source.type || 'application/octet-stream',
      arrayBuffer: () => source.arrayBuffer(), bytes: () => source.bytes(), text: () => source.text(),
      stream: () => source.stream(), slice: (start, end, type) => source.slice(start, end, type),
    };
    return part;
  } catch { throw new AuthError('invalid-kickoff-file'); }
}

export async function scheduleKickoff(grant: Grant, draft: KickoffDraft, agenda: DocumentPickerAsset,
                                      plan: DocumentPickerAsset | null, signal: AbortSignal) {
  if (!authConfig) throw new AuthError('unavailable');
  const endpoint = new URL('projects/kickoff/schedule', authConfig.url);
  const agendaFile = selectedFile(agenda);
  const planFile = plan ? selectedFile(plan) : null;
  if (signal.aborted) throw new AuthError('transport');
  if (frontendPreview) return preview.schedule(draft, agenda, plan);
  const body = new FormData();
  body.append('details', JSON.stringify(draft));
  body.append('agenda', agendaFile, agenda.name);
  if (plan && planFile) body.append('plan', planFile, plan.name);
  const request = new AbortController();
  const stop = () => request.abort();
  signal.addEventListener('abort', stop, { once: true });
  if (signal.aborted) stop();
  const timer = setTimeout(stop, 90_000);
  try {
    const response = await fetch(endpoint.href, { method: 'POST', body, credentials: 'omit', redirect: 'error', signal: request.signal,
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + grant.sessionToken } });
    if (response.url !== endpoint.href) throw new AuthError('bad-response');
    if (response.status === 401) throw new AuthError('expired');
    if (response.status === 403) throw new AuthError('forbidden');
    if (response.status === 404) throw new AuthError('not-found');
    if (response.status === 400 || response.status === 413) throw new AuthError('invalid-kickoff');
    if (response.status === 409) {
      const error = await response.json();
      if (error?.reason === 'kickoff-participants-unavailable') throw new AuthError('kickoff-participants-unavailable');
      if (error?.reason === 'kickoff-conflict') throw new AuthError('kickoff-conflict');
    }
    if (!response.ok) throw new AuthError('unavailable');
    const meetingId = decodeScheduledKickoff(await response.json(), draft);
    if (!meetingId) throw new AuthError('bad-response');
    return meetingId;
  } catch (error) {
    throw error instanceof AuthError ? error : new AuthError(request.signal.aborted ? 'transport' : 'unavailable');
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }
}
