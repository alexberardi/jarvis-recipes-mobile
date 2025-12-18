import { ParsedRecipe } from './Recipe';

export type RecipeIngestionCompletedMessage = {
  type: 'recipe_image_ingestion_completed';
  ingestion_id: string;
  recipe_draft: ParsedRecipe;
  pipeline?: string | null;
  completed_at?: string | null;
};

export type RecipeIngestionFailedMessage = {
  type: 'recipe_image_ingestion_failed';
  ingestion_id: string;
  error_code?: string | null;
  message?: string | null;
};

export type MailboxMessage = RecipeIngestionCompletedMessage | RecipeIngestionFailedMessage;

export type RecipeIngestionJobResponse = {
  ingestion_id?: string;
  id?: string;
};

