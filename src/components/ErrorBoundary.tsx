import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * App-wide error boundary. Catches render-time exceptions thrown by any screen
 * or provider below it and shows a recoverable fallback instead of a blank
 * white screen (a thrown render error otherwise unmounts the whole React tree).
 *
 * Deliberately renders with plain React Native primitives only — no Paper,
 * theme, navigation, or context — so the fallback still appears even when one
 * of those providers is the thing that failed. Colors are the app's own dark
 * palette, hardcoded for the same reason.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Nothing ships remotely; this is the hook a crash reporter would attach to.
    console.error('[ErrorBoundary] Unhandled render error:', error, info.componentStack);
  }

  handleReset = (): void => {
    // Re-mount the subtree; recovers from transient errors (bad nav param,
    // momentary null) without forcing the user to kill the app.
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            The app hit an unexpected error. Try again — if it keeps happening,
            restart the app.
          </Text>
          <Pressable
            style={styles.button}
            onPress={this.handleReset}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.buttonText}>Try Again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#0f172a',
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
  },
  button: {
    backgroundColor: '#8A00C4',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
