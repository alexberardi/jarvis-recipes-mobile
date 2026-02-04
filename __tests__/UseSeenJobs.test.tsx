import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Button, Text } from 'react-native';

import { useSeenJobs } from '../src/hooks/useSeenJobs';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const SeenJobsConsumer = () => {
  const { seen, markSeen, ready } = useSeenJobs();
  return (
    <>
      <Text testID="ready">{ready ? 'ready' : 'loading'}</Text>
      <Text testID="seen">{JSON.stringify(seen)}</Text>
      <Button
        title="mark"
        onPress={async () => {
          await markSeen(['a', 'b']);
        }}
      />
    </>
  );
};

describe('useSeenJobs', () => {
  it('marks ids as seen and persists', async () => {
    const { getByText, getByTestId } = render(<SeenJobsConsumer />);

    await waitFor(() => expect(getByTestId('ready').props.children).toBe('ready'));

    fireEvent.press(getByText('mark'));

    await waitFor(() =>
      expect(getByTestId('seen').props.children).toContain('"a":true'),
    );
  });
});

