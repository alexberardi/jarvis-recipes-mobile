export type AuthUser = {
  id: string;
  name: string;
};

export const getCurrentUser = async (): Promise<AuthUser> =>
  Promise.resolve({ id: 'demo-user', name: 'Family Chef' });

