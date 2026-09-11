import { apiFetch } from '@/lib/api-client';

export async function uploadToStorage(
  contextId: string,
  file: File,
  attachmentId: string,
): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'bin';

  try {
    // The server builds the path now, from the signed-in id it verified, so
    // nothing here decides where the file lands. This used to start from
    // getCurrentUserId(), which falls back to a random value in local storage,
    // and the server signed whatever path it was handed.
    const urlData = await apiFetch<{ signedUrl: string; path: string; token: string }>(
      '/api/db/attachments',
      {
        method: 'POST',
        body: JSON.stringify({
          action: 'signed_upload_url',
          context_id: contextId,
          attachment_id: attachmentId,
          ext,
        }),
      },
    );

    if (!urlData?.signedUrl || !urlData?.path) return null;

    const uploadRes = await fetch(urlData.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });

    if (!uploadRes.ok) return null;

    // The server's path, not one built here. Callers save this against the
    // record, so returning anything else would point saved trips and
    // attachments at files that do not exist, and the failure would only show
    // up later as a file that silently refuses to open.
    return urlData.path;
  } catch (error) {
    console.error('[attachment-storage] upload failed:', error);
    return null;
  }
}

export async function getSignedUrl(storagePath: string): Promise<string | null> {
  try {
    const data = await apiFetch<{ signedUrl: string }>('/api/db/attachments', {
      method: 'POST',
      body: JSON.stringify({ action: 'signed_read_url', path: storagePath }),
    });
    return data?.signedUrl || null;
  } catch (error) {
    console.error('[attachment-storage] signed URL failed:', error);
    return null;
  }
}
