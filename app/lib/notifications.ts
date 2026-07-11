import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { api } from './api';

/**
 * Best-effort: ask for notification permission and register the Expo push
 * token with the backend so wisdom notifications can be delivered.
 * No-ops on web, in Expo Go without a projectId, or when permission is denied.
 */
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const projectId: string | undefined =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = (
      await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    ).data;
    await api.registerPushToken(token);
  } catch {
    // Push is optional — never block the app on it.
  }
}
