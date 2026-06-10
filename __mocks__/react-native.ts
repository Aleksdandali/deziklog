// Minimal react-native surface for node-environment unit tests. Real RN can't
// be parsed by jest here (Flow syntax); lib modules only need these pieces.
export const Platform = {
  OS: 'ios' as const,
  select: <T>(spec: { ios?: T; android?: T; default?: T }): T | undefined =>
    spec.ios ?? spec.default,
};

export const AppState = {
  currentState: 'active',
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
};

export const Alert = { alert: jest.fn() };
