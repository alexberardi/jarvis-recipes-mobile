import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Appbar, Button, HelperText, IconButton, Text, TextInput } from 'react-native-paper';

import { RecipesStackParamList } from '../../navigation/types';
import { LocalImage } from '../../services/recipeIngestion';

type Props = NativeStackScreenProps<RecipesStackParamList, 'AddRecipeFromImages'>;

type SelectedImage = LocalImage & { id: string };

const MAX_IMAGES = 8;

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const formatPickerError = (err: any) => {
  const msg = err?.message || err?.toString?.() || '';
  if (msg.toLowerCase().includes('public.heic') || msg.toLowerCase().includes('heic')) {
    return 'Unable to load HEIC images in this simulator. Please pick a JPEG/PNG (or try again on device).';
  }
  return msg || 'Unable to open images. Please try again.';
};

const AddRecipeImagesScreen = ({ navigation }: Props) => {
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [titleHint, setTitleHint] = useState('');
  const [isPicking, setIsPicking] = useState(false);

  const remaining = MAX_IMAGES - images.length;
  const maxReached = remaining <= 0;

  const addImages = (assets: ImagePicker.ImagePickerAsset[]) => {
    if (!assets.length) return;
    const slots = MAX_IMAGES - images.length;
    if (assets.length > slots) {
      setError('Max 8 images. Remove one to add more.');
    }
    const next = assets.slice(0, slots).map((asset) => ({
      id: makeId(),
      uri: asset.uri,
      name: asset.fileName ?? 'photo.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    }));
    setImages((prev) => [...prev, ...next]);
  };

  const handlePickFromLibrary = async () => {
    if (maxReached) {
      setError('Max 8 images. Remove one to add more.');
      return;
    }
    setIsPicking(true);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        mediaTypes: 'images',
      });
      if (res.canceled || !res.assets) return;
      addImages(res.assets);
    } catch (err: any) {
      setError(formatPickerError(err));
    } finally {
      setIsPicking(false);
    }
  };

  const handleTakePhoto = async () => {
    if (maxReached) {
      setError('Max 8 images. Remove one to add more.');
      return;
    }
    setIsPicking(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        setError('Camera permission is required.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
      });
      if (res.canceled || !res.assets) return;
      addImages(res.assets);
    } catch (err: any) {
      setError(formatPickerError(err));
    } finally {
      setIsPicking(false);
    }
  };

  const handleRemove = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
    setError(null);
  };

  const handleMove = (id: string, direction: 'up' | 'down') => {
    setImages((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx === -1) return prev;
      const target = direction === 'up' ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const handleExtract = () => {
    if (!images.length) {
      setError('Add at least one image.');
      return;
    }
    navigation.navigate('RecipeExtractionProgress', {
      images,
      titleHint: titleHint.trim() || undefined,
    } as any);
  };

  const renderItem = ({ item, index }: { item: SelectedImage; index: number }) => (
    <View style={styles.imageCard}>
      <Image source={{ uri: item.uri }} style={styles.image} />
      <View style={styles.imageActions}>
        <IconButton
          icon="chevron-up"
          disabled={index === 0}
          onPress={() => handleMove(item.id, 'up')}
        />
        <IconButton
          icon="chevron-down"
          disabled={index === images.length - 1}
          onPress={() => handleMove(item.id, 'down')}
        />
        <IconButton icon="delete" onPress={() => handleRemove(item.id)} />
      </View>
    </View>
  );

  const footer = useMemo(
    () => (
      <Text variant="bodySmall" style={styles.helper}>
        You can add up to 8 images. Order matters and is preserved during upload.
      </Text>
    ),
    [],
  );

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Add from Images" />
      </Appbar.Header>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        keyboardVerticalOffset={80}
      >
        <View style={styles.container}>
          <TextInput
            label="Title hint (optional)"
            value={titleHint}
            onChangeText={setTitleHint}
            placeholder="e.g. Grandma's lasagna"
          />
          <View style={styles.row}>
            <Button
              mode="contained"
              icon="camera"
              onPress={handleTakePhoto}
              disabled={isPicking || maxReached}
            >
              Take photo
            </Button>
            <Button
              mode="outlined"
              icon="image-multiple"
              onPress={handlePickFromLibrary}
              disabled={isPicking || maxReached}
            >
              Choose from library
            </Button>
          </View>
          {error ? (
            <HelperText type="error" visible>
              {error}
            </HelperText>
          ) : null}
          <FlatList
            data={images}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            numColumns={2}
            columnWrapperStyle={styles.column}
            ListFooterComponent={footer}
            contentContainerStyle={styles.list}
          />
          <Button
            mode="contained"
            icon="cloud-upload"
            onPress={handleExtract}
            disabled={!images.length}
            style={styles.extract}
          >
            Extract recipe
          </Button>
        </View>
      </KeyboardAvoidingView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  list: {
    gap: 12,
    paddingVertical: 8,
  },
  column: {
    gap: 12,
  },
  imageCard: {
    flex: 1,
    minHeight: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
  },
  image: {
    flex: 1,
    width: '100%',
  },
  imageActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  helper: {
    marginTop: 4,
    color: '#666',
  },
  extract: {
    marginTop: 8,
  },
});

export default AddRecipeImagesScreen;

