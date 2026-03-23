import Share from 'react-native-share';
import * as MediaLibrary from 'expo-media-library';
import * as Linking from 'expo-linking';
import { Alert, Platform } from 'react-native';

export async function shareToInstagramStory(imageUri: string): Promise<void> {
  try {
    const canOpen = await Linking.canOpenURL('instagram-stories://share');

    if (canOpen && Platform.OS === 'ios') {
      await Share.shareSingle({
        stickerImage: imageUri,
        backgroundTopColor: '#4B569E',
        backgroundBottomColor: '#252A4A',
        social: Share.Social.INSTAGRAM_STORIES,
        appId: '___META_APP_ID___',
      });
    } else {
      await saveToGalleryFallback(imageUri);
    }
  } catch (error: any) {
    if (error?.message?.includes('User did not share')) {
      return;
    }
    await saveToGalleryFallback(imageUri);
  }
}

async function saveToGalleryFallback(imageUri: string): Promise<void> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Потрібен дозвіл', 'Дозвольте доступ до галереї для збереження картки');
      return;
    }
    await MediaLibrary.saveToLibraryAsync(imageUri);
    Alert.alert(
      'Картку збережено',
      'Відкрийте Instagram → Stories → виберіть картку з галереї',
      [
        { text: 'Відкрити Instagram', onPress: () => Linking.openURL('instagram://').catch(() => {}) },
        { text: 'OK' },
      ],
    );
  } catch {
    Alert.alert('Помилка', 'Не вдалось зберегти картку');
  }
}
