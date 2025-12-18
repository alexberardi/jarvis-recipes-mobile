import { ParsedRecipe } from './Recipe';

export type ParseJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETE' | 'ERROR';

export type ParseJob = {
  id: string;
  status: ParseJobStatus;
  result?: {
    success: boolean;
    recipe?: ParsedRecipe | null;
    used_llm?: boolean;
    parser_strategy?: string | null;
    warnings?: string[];
    error_code?: string | null;
    error_message?: string | null;
  } | null;
  error_code?: string | null;
  error_message?: string | null;
};

export type ParseJobPreview = {
  id: string;
  job_type: string;
  url: string;
  status: ParseJobStatus;
  completed_at?: string;
  warnings?: string[];
  preview?: {
    title?: string | null;
    source_host?: string | null;
  };
};

export type ParseJobListResponse = {
  jobs: ParseJobPreview[];
};

