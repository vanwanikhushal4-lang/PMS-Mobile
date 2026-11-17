import { Platform } from 'react-native';
import { resolveConnection } from './connection';

const simulatorUrl = Platform.select({
  android: 'http://10.0.2.2:8080/SCM/',
  default: 'http://127.0.0.1:8080/SCM/',
});

export const connectionConfig = resolveConnection(
  process.env.EXPO_PUBLIC_SCM_URL ?? (__DEV__ ? simulatorUrl : undefined),
  __DEV__,
);
