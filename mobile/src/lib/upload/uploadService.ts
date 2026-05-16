import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '@/src/lib/supabase';

const BUCKET = 'audio-recordings';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function uploadAudioWithRetry(
  uri: string,
  userId: string,
  meetingId: string,
  maxRetries = 3
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const arrayBuffer = decode(base64);
      const path = `${userId}/${meetingId}.m4a`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, arrayBuffer, { contentType: 'audio/m4a', upsert: true });

      if (uploadError) throw uploadError;

      // 24h signed URL for backend download
      const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 86400);

      if (signError || !signed?.signedUrl) throw signError ?? new Error('No signed URL');

      return signed.signedUrl;
    } catch (err) {
      lastError = err;
      console.error(`[Upload] attempt ${attempt} failed:`, JSON.stringify(err));
      if (attempt < maxRetries) {
        await delay(attempt * 1000); // 1s, 2s, 3s
      }
    }
  }

  throw lastError;
}
