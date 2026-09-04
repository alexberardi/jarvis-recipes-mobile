/**
 * LoginScreen: the submit gate and the server-error surface. `useAuth` is
 * mocked so this stays a screen test — AuthContext's own persistence is
 * covered in auth/AuthContext.test.
 *
 * Paper's TextInput renders its `label` as a Text node inside the input, and
 * "Log In" appears in both the header and the button, so the queries below go
 * through getAllByText the way jarvis-node-mobile's screen tests do.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import LoginScreen from '../../src/screens/Auth/LoginScreen';

// `mock`-prefixed so babel-plugin-jest-hoist allows the factory to close over it.
const mockLogin = jest.fn();

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;

const renderScreen = () =>
  render(
    <PaperProvider>
      <LoginScreen navigation={navigation} route={{} as any} />
    </PaperProvider>,
  );

const lastByText = (text: string) => {
  const matches = screen.getAllByText(text);
  return matches[matches.length - 1];
};

const fillForm = (email: string, password: string) => {
  fireEvent.changeText(lastByText('Email'), email);
  fireEvent.changeText(lastByText('Password'), password);
};

const submit = () => fireEvent.press(lastByText('Log In'));

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogin.mockResolvedValue(undefined);
  });

  it('will not submit until both fields are filled', () => {
    renderScreen();

    submit();
    expect(mockLogin).not.toHaveBeenCalled();

    fireEvent.changeText(lastByText('Email'), 'cook@example.com');
    submit();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('submits a trimmed email with the password left untouched', async () => {
    renderScreen();

    fillForm('  cook@example.com  ', ' hunter2 ');
    submit();

    await waitFor(() =>
      expect(mockLogin).toHaveBeenCalledWith('cook@example.com', ' hunter2 '),
    );
  });

  it('surfaces the server detail message when the login is rejected', async () => {
    mockLogin.mockRejectedValue({ response: { data: { detail: 'Invalid credentials' } } });
    renderScreen();

    fillForm('cook@example.com', 'wrong');
    submit();

    expect(await screen.findByText('Invalid credentials')).toBeTruthy();
  });

  it('falls back to a generic message when the failure carries no detail', async () => {
    mockLogin.mockRejectedValue({});
    renderScreen();

    fillForm('cook@example.com', 'wrong');
    submit();

    expect(await screen.findByText('Unable to log in. Please try again.')).toBeTruthy();
  });

  it('routes to Register from the secondary action', () => {
    renderScreen();

    fireEvent.press(screen.getByText('Need an account? Create one'));

    expect(navigation.navigate).toHaveBeenCalledWith('Register');
  });
});
