import { recipesRequest } from '../api/recipesApi';

export type Tag = {
  id: number;
  name: string;
};

export const getTags = async (): Promise<Tag[]> => {
  return recipesRequest<Tag[]>({ url: '/tags', method: 'GET' });
};

export const createTag = async (name: string): Promise<Tag> => {
  return recipesRequest<Tag>({ url: '/tags', method: 'POST', data: { name } });
};

