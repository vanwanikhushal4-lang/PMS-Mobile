import Constants, { ExecutionEnvironment } from 'expo-constants';
import { fetch } from 'expo/fetch';
import { Platform } from 'react-native';
import { createAuthClient, resolveAuthConfig } from './auth-api';
import { preview } from './frontend-preview';

export const frontendPreview = __DEV__ && process.env.EXPO_PUBLIC_SCM_FRONTEND_PREVIEW === '1';
const standaloneQA = Platform.OS === 'ios' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient
  && Constants.expoConfig?.ios?.bundleIdentifier === 'com.velox.scm.mobile.qa';
export const authConfig = frontendPreview
  ? { url: new URL('https://frontend-preview.invalid/mobile/v1/auth/'), fixture: true }
  : resolveAuthConfig(process.env.EXPO_PUBLIC_SCM_AUTH_URL, (__DEV__ || standaloneQA) && process.env.EXPO_PUBLIC_SCM_FIXTURE === '1');
export const authClient = authConfig ? createAuthClient(authConfig, frontendPreview ? preview.request : fetch) : null;
