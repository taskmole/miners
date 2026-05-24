import { apiFetch } from '@/lib/api-client';
import { getCurrentUserId } from '@/lib/browser-session';

export async function uploadToStorage(
  contextId: string,
  file: File,
  attachmentId: string,
): Promise<string | null> {
  const userId = getCurrentUserId();
  const ext = file.name.split('.').pop() || 'bin';
  const storagePath = `${userId}/${contextId}/${attachmentId}.${ext}`;

  try {
    const urlData = await apiFetch<{ signedUrl: string; path: string; token: string }>(
      '/api/db/attachments',
      {
        method: 'POST',
        body: JSON.stringify({ action: 'signed_upload_url', path: storagePath }),
      },
    );

    if (!urlData?.signedUrl) return null;

    const uploadRes = await fetch(urlData.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });

    if (!uploadRes.ok) return null;

    return storagePath;
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
