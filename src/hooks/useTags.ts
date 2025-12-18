import { useQuery } from '@tanstack/react-query';

import { getTags, Tag } from '../services/tags';

export const TAGS_QUERY_KEY = ['tags'];

export const useTags = () =>
  useQuery<Tag[]>({
    queryKey: TAGS_QUERY_KEY,
    queryFn: getTags,
  });

