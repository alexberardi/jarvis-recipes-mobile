/**
 * Which items are already in the trolley.
 *
 * Device-local, deliberately. The list itself is recomputed server-side on every
 * request and is not a stored artifact, so there is no row to hang a "checked"
 * flag off. It is also genuinely per-person: two people shopping from the same
 * plan in different shops should not be unticking each other's items.
 *
 * Keyed by range so last week's ticks do not carry into this week's list.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const key = (start: string, end: string) => `@jarvis_recipes/checked/${start}_${end}`;

export const useCheckedItems = (start: string, end: string) => {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    AsyncStorage.getItem(key(start, end))
      .then((raw) => {
        if (cancelled) return;
        setChecked(raw ? JSON.parse(raw) : {});
      })
      .catch(() => {
        // A corrupt or unreadable value must not stop the list rendering; the
        // worst case is starting the shop with nothing ticked.
        if (!cancelled) setChecked({});
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [start, end]);

  const toggle = useCallback(
    (name: string) => {
      setChecked((prev) => {
        const next = { ...prev, [name]: !prev[name] };
        AsyncStorage.setItem(key(start, end), JSON.stringify(next)).catch(() => {
          // Persisted best-effort: the tick is already applied in state, and
          // failing to write it must not make the checkbox appear not to work.
        });
        return next;
      });
    },
    [start, end],
  );

  const clear = useCallback(() => {
    setChecked({});
    AsyncStorage.removeItem(key(start, end)).catch(() => {});
  }, [start, end]);

  return { checked, ready, toggle, clear };
};
