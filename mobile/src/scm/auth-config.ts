import { fetch } from 'expo/fetch';
import { createAuthClient, resolveAuthConfig } from './auth-api';

export const authConfig = resolveAuthConfig(process.env.EXPO_PUBLIC_SCM_AUTH_URL, __DEV__ && process.env.EXPO_PUBLIC_SCM_FIXTURE === '1');
export const authClient = authConfig ? createAuthClient(authConfig, fetch) : null;
