import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Text, Button } from 'react-native-paper';

import { ThemeProvider, useThemePreference } from '../src/theme/ThemeProvider';

const ThemeConsumer = () => {
  const { themeName, toggleTheme } = useThemePreference();
  return (
    <>
      <Text testID="theme">{themeName}</Text>
      <Button onPress={toggleTheme}>Toggle</Button>
    </>
  );
};

const renderWithProvider = () =>
  render(
    <ThemeProvider>
      <ThemeConsumer />
    </ThemeProvider>,
  );

describe('ThemeProvider', () => {
  it('toggles between light and dark', async () => {
    const { getByTestId, getByText } = renderWithProvider();

    await waitFor(() => expect(getByTestId('theme').props.children).toBeDefined());

    expect(getByTestId('theme').props.children).toBe('light');
    fireEvent.press(getByText('Toggle'));
    await waitFor(() => expect(getByTestId('theme').props.children).toBe('dark'));
    fireEvent.press(getByText('Toggle'));
    await waitFor(() => expect(getByTestId('theme').props.children).toBe('light'));
  });
});

