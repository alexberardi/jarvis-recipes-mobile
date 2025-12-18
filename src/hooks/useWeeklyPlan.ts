import { useQuery } from '@tanstack/react-query';

import { getWeeklyPlan } from '../services/mockApi';

export const WEEKLY_PLAN_QUERY_KEY = ['weekly-plan'];

export const useWeeklyPlan = () =>
  useQuery({
    queryKey: WEEKLY_PLAN_QUERY_KEY,
    queryFn: getWeeklyPlan,
  });

