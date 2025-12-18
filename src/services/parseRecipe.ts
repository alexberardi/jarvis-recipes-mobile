import { recipesRequest } from '../api/recipesApi';
import { ParseJob, ParseJobListResponse } from '../types/ParseJob';

export const enqueueParseUrl = async (url: string) => {
  try {
    return await recipesRequest<{ id: string; status: string }>({
      url: '/recipes/parse-url/async',
      method: 'POST',
      data: { url, use_llm_fallback: true },
  });
  } catch (err: any) {
    // Bubble structured server errors to the caller for WebView fallback decisions.
    throw err;
  }
};

export const getParseJobStatus = async (jobId: string): Promise<ParseJob> => {
  return recipesRequest<ParseJob>({ url: `/recipes/jobs/${jobId}`, method: 'GET' });
};

export const getParseJobs = async (): Promise<ParseJobListResponse> => {
  return recipesRequest<ParseJobListResponse>({
    url: '/recipes/parse-url/jobs',
    method: 'GET',
  });
};

export const abandonParseJob = async (jobId: string): Promise<ParseJob> => {
  return recipesRequest<ParseJob>({
    url: `/recipes/parse-url/jobs/${jobId}/abandon`,
    method: 'POST',
  });
};

export const submitParsePayload = async (payload: any) => {
  return recipesRequest<{ id: string; status: string }>({
    url: '/recipes/parse-payload/async',
    method: 'POST',
    data: payload,
  });
};

