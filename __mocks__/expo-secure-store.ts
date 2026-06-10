const store: Record<string, string> = {};
export const AFTER_FIRST_UNLOCK = 'AFTER_FIRST_UNLOCK';
export const setItemAsync = jest.fn((key: string, value: string) => {
  store[key] = value;
  return Promise.resolve();
});
export const getItemAsync = jest.fn((key: string) => Promise.resolve(store[key] ?? null));
export const deleteItemAsync = jest.fn((key: string) => {
  delete store[key];
  return Promise.resolve();
});
export const __store = store;
export const __reset = () => { Object.keys(store).forEach((k) => delete store[k]); };
