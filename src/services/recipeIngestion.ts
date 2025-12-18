import * as ImageManipulator from 'expo-image-manipulator';
import { recipesRequest } from '../api/recipesApi';
import { MailboxMessage } from '../types/RecipeIngestion';
import { pollWithBackoff } from './jobPolling';

export type LocalImage = {
  uri: string;
  name?: string;
  type?: string;
};

type SubmitOptions = {
  titleHint?: string;
  tierMax?: number;
  signal?: AbortSignal;
  onUploadProgress?: (percent: number) => void;
};

const MAX_IMAGES = 8;
const MAX_EDGE = 2048;

export const submitImageIngestionJob = async (
  images: LocalImage[],
  options: SubmitOptions = {},
): Promise<{ jobId: string; ingestionId: string }> => {
  if (!images.length) {
    throw new Error('Select at least one image.');
  }
  if (images.length > MAX_IMAGES) {
    throw new Error('Max 8 images are allowed.');
  }

  const processed: LocalImage[] = [];
  for (const [index, img] of images.entries()) {
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        img.uri,
        [{ resize: { width: MAX_EDGE, height: MAX_EDGE } }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: false },
      );
      processed.push({
        uri: manipulated.uri,
        name: img.name || `image-${index + 1}.jpg`,
        type: 'image/jpeg',
      });
    } catch {
      processed.push({
        uri: img.uri,
        name: img.name || `image-${index + 1}.jpg`,
        type: img.type || 'image/jpeg',
      });
    }
  }

  const formData = new FormData();
  processed.forEach((img, index) => {
    formData.append('images', {
      uri: img.uri,
      name: img.name || `image-${index + 1}.jpg`,
      type: img.type || 'image/jpeg',
    } as any);
  });

  if (options.titleHint) {
    formData.append('title_hint', options.titleHint);
  }
  if (options.tierMax != null) {
    formData.append('tier_max', String(options.tierMax));
  }

  const payload = await recipesRequest<any>({
    url: '/recipes/from-image/jobs',
    method: 'POST',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    signal: options.signal as any,
    onUploadProgress: (evt: any) => {
      if (!options.onUploadProgress) return;
      if (evt.total) {
        const pct = Math.round((evt.loaded / evt.total) * 100);
        options.onUploadProgress(pct);
      }
    },
  });

  const jobId = payload?.id || payload?.job_id;
  const ingestionId = payload?.ingestion_id || jobId;
  if (!jobId) {
    throw new Error('No job_id returned from server.');
  }
  return { jobId, ingestionId };
};

export const fetchIngestionJob = async (jobId: string): Promise<any> => {
  return recipesRequest<any>({ url: `/recipes/jobs/${jobId}`, method: 'GET' });
};

export const waitForIngestionMessage = async (
  jobId: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<any> =>
  pollWithBackoff(
    () => fetchIngestionJob(jobId),
    (payload) =>
      payload?.status === 'COMPLETE' ||
      payload?.status === 'ERROR' ||
      payload?.type === 'recipe_image_ingestion_completed' ||
      payload?.type === 'recipe_image_ingestion_failed',
    { timeoutMs: options.timeoutMs ?? 90_000, signal: options.signal },
  );

// TODO: add tests for waitForIngestionMessage behavior and max image validation.

