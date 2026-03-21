/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
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
  },
};
