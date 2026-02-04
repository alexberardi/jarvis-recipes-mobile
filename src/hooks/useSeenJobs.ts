import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const SEEN_KEY = 'parse_jobs_seen_v1';

export const useSeenJobs = () => {
  const [seen, setSeen] = useState<Record<string, true>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(SEEN_KEY);
        setSeen(raw ? JSON.parse(raw) : {});
      } catch (error) {
        console.warn('[useSeenJobs] Failed to load seen jobs:', error instanceof Error ? error.message : String(error));
        setSeen({});
      } finally {
        setReady(true);
      }
    };
    load();
  }, []);

  const persist = async (next: Record<string, true>) => {
    setSeen(next);
    try {
      await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn('[useSeenJobs] Failed to persist seen jobs:', error instanceof Error ? error.message : String(error));
    }
  };

  const markSeen = async (ids: string[]) => {
    const next = { ...seen };
    ids.forEach((id) => {
      next[id] = true;
    });
    await persist(next);
  };

  return { seen, ready, markSeen };
};

