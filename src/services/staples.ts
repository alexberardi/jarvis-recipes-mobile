/**
 * Staples: what the household always has in.
 *
 * The server stores these as shopping-list KEYS, which is what `ShoppingItem.name`
 * already is -- so a staple's `name` can be compared to a list row directly, with
 * no normalising on this side. Sending raw text is fine on the way in; the server
 * normalises it, and this client must not try to reproduce that logic.
 */
import { recipesRequest } from '../api/recipesApi';

export type Staple = {
  id: number;
  /** The shopping-list key, matching `ShoppingItem.name`. */
  name: string;
};

export const getStaples = async (): Promise<Staple[]> =>
  recipesRequest<Staple[]>({ url: '/staples', method: 'GET' });

/** Idempotent server-side: adding an existing staple returns it. */
export const addStaple = async (name: string): Promise<Staple> =>
  recipesRequest<Staple>({ url: '/staples', method: 'POST', data: { name } });

export const removeStaple = async (id: number): Promise<void> =>
  recipesRequest<void>({ url: `/staples/${id}`, method: 'DELETE' });
