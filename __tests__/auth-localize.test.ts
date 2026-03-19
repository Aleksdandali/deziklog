/**
 * Tests for Supabase error localization (auth.tsx localizeError).
 */

function localizeError(msg: string): string {
  const map: Record<string, string> = {
    'Invalid login credentials': 'Невірний email або пароль',
    'Email not confirmed': 'Email не підтверджено. Перевірте пошту.',
    'User already registered': 'Цей email вже зареєстровано. Спробуйте увійти.',
    'Password should be at least 6 characters': 'Пароль має містити щонайменше 6 символів',
    'Unable to validate email address: invalid format': 'Невірний формат email',
    'Signup requires a valid password': 'Введіть пароль',
    'For security purposes, you can only request this after': 'Забагато спроб. Зачекайте хвилину.',
  };
  for (const [key, value] of Object.entries(map)) {
    if (msg.includes(key)) return value;
  }
  return msg;
}

describe('localizeError', () => {
  it('translates "Invalid login credentials"', () => {
    expect(localizeError('Invalid login credentials')).toBe('Невірний email або пароль');
  });

  it('translates "Email not confirmed"', () => {
    expect(localizeError('Email not confirmed')).toBe('Email не підтверджено. Перевірте пошту.');
  });

  it('translates "User already registered"', () => {
    expect(localizeError('User already registered')).toBe('Цей email вже зареєстровано. Спробуйте увійти.');
  });

  it('translates rate limiting message', () => {
    expect(localizeError('For security purposes, you can only request this after 58 seconds')).toBe('Забагато спроб. Зачекайте хвилину.');
  });

  it('returns original message if no match found', () => {
    expect(localizeError('Some unknown error')).toBe('Some unknown error');
  });

  it('matches partial messages (contains check)', () => {
    expect(localizeError('Error: Invalid login credentials. Please try again.')).toBe('Невірний email або пароль');
  });

  it('handles empty string', () => {
    expect(localizeError('')).toBe('');
  });
});
