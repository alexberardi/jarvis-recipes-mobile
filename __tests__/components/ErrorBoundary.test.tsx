/**
 * ErrorBoundary: the last line of defence between a render-time throw and a
 * blank white app. Asserts the fallback appears at all, and that "Try Again"
 * genuinely re-mounts the subtree rather than just clearing the message.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import ErrorBoundary from '../../src/components/ErrorBoundary';

let shouldThrow = true;

const Boom = () => {
  if (shouldThrow) {
    throw new Error('kaboom');
  }
  return <Text>recovered content</Text>;
};

describe('ErrorBoundary', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    shouldThrow = true;
    // React logs the caught error itself; silence it so a passing run is clean.
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('renders children when nothing throws', () => {
    shouldThrow = false;

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText('recovered content')).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('renders the fallback instead of unmounting the tree on a throw', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText('Try Again')).toBeTruthy();
    expect(screen.queryByText('recovered content')).toBeNull();
  });

  it('reports the error and the component stack for a crash reporter to pick up', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(consoleError).toHaveBeenCalledWith(
      '[ErrorBoundary] Unhandled render error:',
      expect.objectContaining({ message: 'kaboom' }),
      expect.any(String),
    );
  });

  it('Try Again re-mounts the subtree once the cause is gone', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();

    shouldThrow = false;
    fireEvent.press(screen.getByText('Try Again'));

    expect(screen.getByText('recovered content')).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('falls back again if the retry throws a second time', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    fireEvent.press(screen.getByText('Try Again'));

    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });
});
