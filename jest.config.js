/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  globals: { __DEV__: false },
  roots: ['<rootDir>/__tests__'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  transform: {
    '^.+\\.tsx?$': ['@swc/jest', {
      jsc: {
        parser: { syntax: 'typescript', tsx: true },
        target: 'es2020',
      },
      module: { type: 'commonjs' },
    }],
  },
  moduleNameMapper: {
    '^expo-notifications$': '<rootDir>/__mocks__/expo-notifications.ts',
    '^expo-print$': '<rootDir>/__mocks__/expo-print.ts',
    '^@react-native-async-storage/async-storage$': '<rootDir>/__mocks__/async-storage.ts',
    '^@supabase/supabase-js$': '<rootDir>/__mocks__/supabase-js.ts',
    '^expo-device$': '<rootDir>/__mocks__/expo-device.ts',
    '^expo-constants$': '<rootDir>/__mocks__/expo-constants.ts',
    '^expo-secure-store$': '<rootDir>/__mocks__/expo-secure-store.ts',
    '^expo-crypto$': '<rootDir>/__mocks__/expo-crypto.ts',
    '^react-native$': '<rootDir>/__mocks__/react-native.ts',
  },
};
