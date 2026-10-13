import { resolveMediaUrl, resolveRecipeImageUrl } from '../../src/utils/mediaUrl';
import { getServerUrls } from '../../src/config/serverConfig';

jest.mock('../../src/config/serverConfig', () => ({
  getServerUrls: jest.fn(),
}));

const mockedGetServerUrls = getServerUrls as jest.MockedFunction<typeof getServerUrls>;

describe('resolveMediaUrl', () => {
  const base = 'http://10.0.0.122:7030';

  it('joins a relative path with a leading slash', () => {
    expect(resolveMediaUrl('/media/abc.jpg', base)).toBe('http://10.0.0.122:7030/media/abc.jpg');
  });

  it('joins a relative path without a leading slash', () => {
    expect(resolveMediaUrl('media/abc.jpg', base)).toBe('http://10.0.0.122:7030/media/abc.jpg');
  });

  it('handles a base with a trailing slash', () => {
    expect(resolveMediaUrl('/media/abc.jpg', `${base}/`)).toBe(
      'http://10.0.0.122:7030/media/abc.jpg',
    );
    expect(resolveMediaUrl('media/abc.jpg', `${base}//`)).toBe(
      'http://10.0.0.122:7030/media/abc.jpg',
    );
  });

  it('keeps a base path prefix (reverse proxy)', () => {
    expect(resolveMediaUrl('/media/abc.jpg', 'https://jarvis.example.com/recipes/')).toBe(
      'https://jarvis.example.com/recipes/media/abc.jpg',
    );
  });

  it('leaves absolute http/https URLs untouched', () => {
    const web = 'https://cdn.example.com/img/tacos.jpg?w=600';
    expect(resolveMediaUrl(web, base)).toBe(web);
    expect(resolveMediaUrl('HTTP://old.host:7030/media/x.jpg', base)).toBe(
      'HTTP://old.host:7030/media/x.jpg',
    );
  });

  it('leaves other schemes and protocol-relative URLs untouched', () => {
    expect(resolveMediaUrl('file:///tmp/pick.jpg', base)).toBe('file:///tmp/pick.jpg');
    expect(resolveMediaUrl('data:image/png;base64,AAA', base)).toBe('data:image/png;base64,AAA');
    expect(resolveMediaUrl('//cdn.example.com/a.jpg', base)).toBe('//cdn.example.com/a.jpg');
  });

  it('returns null for empty, whitespace, null and undefined', () => {
    expect(resolveMediaUrl('', base)).toBeNull();
    expect(resolveMediaUrl('   ', base)).toBeNull();
    expect(resolveMediaUrl(null, base)).toBeNull();
    expect(resolveMediaUrl(undefined, base)).toBeNull();
  });

  it('returns null for a relative path when there is no base', () => {
    expect(resolveMediaUrl('/media/abc.jpg', '')).toBeNull();
    expect(resolveMediaUrl('/media/abc.jpg', null)).toBeNull();
  });

  it('still returns an absolute URL when there is no base', () => {
    expect(resolveMediaUrl('https://x.com/a.jpg', undefined)).toBe('https://x.com/a.jpg');
  });
});

describe('resolveRecipeImageUrl', () => {
  it('resolves against the recipes URL in force at call time', () => {
    mockedGetServerUrls.mockReturnValue({ auth: 'http://a', recipes: 'http://10.0.0.5:7030' });
    expect(resolveRecipeImageUrl('/media/x.jpg')).toBe('http://10.0.0.5:7030/media/x.jpg');

    // Server moved: the same stored value follows it.
    mockedGetServerUrls.mockReturnValue({ auth: 'http://a', recipes: 'https://jarvis.example.com' });
    expect(resolveRecipeImageUrl('/media/x.jpg')).toBe('https://jarvis.example.com/media/x.jpg');
  });
});
