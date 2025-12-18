import { ActivityIndicator } from 'react-native-paper';
import { StyleSheet, View } from 'react-native';

const LoadingIndicator = () => (
  <View style={styles.container}>
    <ActivityIndicator animating size="large" />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
});

export default LoadingIndicator;

