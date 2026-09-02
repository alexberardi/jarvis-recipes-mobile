/**
 * RegisterScreen: the client-side validation that gates the submit button, and
 * the error surface. Same querying idiom as LoginScreen.test — Paper renders
 * the field label as a Text node inside the input.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import RegisterScreen from '../../src/screens/Auth/RegisterScreen';

// `mock`-prefixed so babel-plugin-jest-hoist allows the factory to close over it.
const mockRegister = jest.fn();

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ register: mockRegister }),
}));

const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;

const renderScreen = () =>
  render(
    <PaperProvider>
      <RegisterScreen navigation={navigation} route={{} as any} />
    </PaperProvider>,
  );

const lastByText = (text: string) => {
  const matches = screen.getAllByText(text);
  return matches[matches.length - 1];
};

const fillForm = (email: string, password: string, confirm: string = password) => {
  fireEvent.changeText(lastByText('Email'), email);
  fireEvent.changeText(lastByText('Password'), password);
  fireEvent.changeText(lastByText('Confirm Password'), confirm);
};

const submit = () => fireEvent.press(lastByText('Create Account'));

describe('RegisterScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegister.mockResolvedValue(undefined);
  });

  it('registers once the form is valid, trimming the email', async () => {
    renderScreen();

    fillForm('  cook@example.com  ', 'Hunter2Pass');
    submit();

    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith('cook@example.com', 'Hunter2Pass'),
    );
  });

  it('flags a malformed email and refuses to submit', () => {
    renderScreen();

    fillForm('not-an-email', 'Hunter2Pass');
    submit();

    expect(screen.getByText('Enter a valid email.')).toBeTruthy();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it.each([
    ['Ab1', 'Password must be at least 8 characters.'],
    ['alllowercase1', 'Add at least one uppercase letter.'],
    ['ALLUPPERCASE1', 'Add at least one lowercase letter.'],
    ['NoDigitsHere', 'Add at least one number.'],
  ])('rejects the password %p with its own message', (password, message) => {
    renderScreen();

    fillForm('cook@example.com', password);
    submit();

    expect(screen.getByText(message)).toBeTruthy();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('refuses to submit when the confirmation does not match', () => {
    renderScreen();

    fillForm('cook@example.com', 'Hunter2Pass', 'Hunter2Pasz');
    submit();

    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('surfaces the server detail message when registration is rejected', async () => {
    mockRegister.mockRejectedValue({
      response: { data: { detail: 'Email already registered' } },
    });
    renderScreen();

    fillForm('cook@example.com', 'Hunter2Pass');
    submit();

    expect(await screen.findByText('Email already registered')).toBeTruthy();
  });

  it('routes back to Login from the secondary action', () => {
    renderScreen();

    fireEvent.press(screen.getByText('Back to Log In'));

    expect(navigation.navigate).toHaveBeenCalledWith('Login');
  });
});
