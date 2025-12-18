import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import { Appbar, Button, Text } from 'react-native-paper';

import { RecipesStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RecipesStackParamList, 'AddRecipeMode'>;

const AddRecipeModeScreen = ({ navigation }: Props) => {
  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Add Recipe" />
      </Appbar.Header>
      <View style={styles.container}>
        <Text variant="bodyLarge" style={styles.lead}>
          How would you like to add a recipe?
        </Text>
        <Button mode="contained" onPress={() => navigation.navigate('AddRecipeFromUrl')}>
          From URL
        </Button>
        <Button mode="contained" onPress={() => navigation.navigate('AddRecipeFromImages')}>
          From Photos
        </Button>
        <Button mode="outlined" onPress={() => navigation.navigate('CreateRecipe')}>
          Add manually
        </Button>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  lead: {
    marginBottom: 8,
  },
});

export default AddRecipeModeScreen;

