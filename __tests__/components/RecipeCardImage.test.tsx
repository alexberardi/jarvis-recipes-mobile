/**
 * Editor-uploaded photos are stored as a relative `/media/...` path; the card
 * must resolve it against the CURRENT recipes base URL, and leave web-imported
 * absolute URLs alone. The helper is unit-tested in utils/mediaUrl.test.ts --
 * this proves the component actually calls it.
 */
import { render } from '@testing-library/react-native';
import React from 'react';
import { Image } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';

import RecipeCard from '../../src/components/RecipeCard';
import { getServerUrls } from '../../src/config/serverConfig';
import { Recipe } from '../../src/types/Recipe';

jest.mock('../../src/config/serverConfig', () => ({
  getServerUrls: jest.fn(() => ({ auth: 'http://auth', recipes: 'http://10.0.0.122:7030/' })),
}));

const recipe = (image_url: string | null): Recipe =>
  ({ id: 1, user_id: '1', title: 'Tacos', ingredients: [], steps: [], tags: [], image_url }) as Recipe;

const coverSource = (image_url: string | null) => {
  const { UNSAFE_getByType } = render(
    <PaperProvider>
      <RecipeCard recipe={recipe(image_url)} />
    </PaperProvider>,
  );
  return UNSAFE_getByType(Image).props.source;
};

describe('RecipeCard image', () => {
  it('resolves a relative /media path against the current recipes base URL', () => {
    expect(coverSource('/media/abc.jpg')).toEqual({ uri: 'http://10.0.0.122:7030/media/abc.jpg' });
  });

  it('follows the base URL when the server moves', () => {
    (getServerUrls as jest.Mock).mockReturnValueOnce({ auth: 'x', recipes: 'https://jarvis.example.com' });
    expect(coverSource('/media/abc.jpg')).toEqual({ uri: 'https://jarvis.example.com/media/abc.jpg' });
  });

  it('leaves an absolute web-import URL unchanged', () => {
    expect(coverSource('https://cdn.example.com/t.jpg')).toEqual({ uri: 'https://cdn.example.com/t.jpg' });
  });

  it('falls back to the bundled placeholder with no image', () => {
    expect(coverSource(null)).not.toHaveProperty('uri');
  });
});
