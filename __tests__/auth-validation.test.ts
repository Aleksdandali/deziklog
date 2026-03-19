/**
 * Tests for auth validation logic extracted from auth.tsx.
 * Tests email format, password length, and registration fields.
 */

interface ValidateParams {
  isRegister: boolean;
  name: string;
  salonName: string;
  phone: string;
  city: string;
  email: string;
  password: string;
}

// Extracted validation logic from auth.tsx
function validate(params: ValidateParams): string | null {
  const { isRegister, name, salonName, phone, city, email, password } = params;
  if (isRegister) {
    if (!name.trim()) return "Введіть ваше ім'я";
    if (!salonName.trim()) return 'Введіть назву салону';
    if (!phone.trim()) return 'Введіть телефон';
    if (!city.trim()) return 'Введіть місто';
  }
  if (!email.trim()) return 'Введіть email';
  if (!/\S+@\S+\.\S+/.test(email.trim())) return 'Невірний формат email';
  if (!password.trim()) return 'Введіть пароль';
  if (password.trim().length < 6) return 'Пароль має містити щонайменше 6 символів';
  return null;
}

const validLogin: ValidateParams = {
  isRegister: false,
  name: '',
  salonName: '',
  phone: '',
  city: '',
  email: 'test@example.com',
  password: 'password123',
};

const validRegister: ValidateParams = {
  isRegister: true,
  name: 'Олена',
  salonName: 'Beauty Studio',
  phone: '+380501234567',
  city: 'Одеса',
  email: 'test@example.com',
  password: 'password123',
};

describe('Auth validation — Login', () => {
  it('passes with valid email and password', () => {
    expect(validate(validLogin)).toBeNull();
  });

  it('rejects empty email', () => {
    expect(validate({ ...validLogin, email: '' })).toBe('Введіть email');
    expect(validate({ ...validLogin, email: '   ' })).toBe('Введіть email');
  });

  it('rejects invalid email format', () => {
    expect(validate({ ...validLogin, email: 'notanemail' })).toBe('Невірний формат email');
    expect(validate({ ...validLogin, email: 'a@b' })).toBe('Невірний формат email');
    expect(validate({ ...validLogin, email: '@example.com' })).toBe('Невірний формат email');
  });

  it('accepts various valid email formats', () => {
    expect(validate({ ...validLogin, email: 'user@domain.co.ua' })).toBeNull();
    expect(validate({ ...validLogin, email: 'user+tag@domain.com' })).toBeNull();
  });

  it('rejects empty password', () => {
    expect(validate({ ...validLogin, password: '' })).toBe('Введіть пароль');
  });

  it('rejects password shorter than 6 characters', () => {
    expect(validate({ ...validLogin, password: '12345' })).toBe('Пароль має містити щонайменше 6 символів');
  });

  it('accepts password of exactly 6 characters', () => {
    expect(validate({ ...validLogin, password: '123456' })).toBeNull();
  });

  it('does not require name/salon/phone/city for login', () => {
    expect(validate({ ...validLogin, name: '', salonName: '', phone: '', city: '' })).toBeNull();
  });
});

describe('Auth validation — Registration', () => {
  it('passes with all fields filled', () => {
    expect(validate(validRegister)).toBeNull();
  });

  it('rejects empty name', () => {
    expect(validate({ ...validRegister, name: '' })).toBe("Введіть ваше ім'я");
  });

  it('rejects empty salon name', () => {
    expect(validate({ ...validRegister, salonName: '' })).toBe('Введіть назву салону');
  });

  it('rejects empty phone', () => {
    expect(validate({ ...validRegister, phone: '' })).toBe('Введіть телефон');
  });

  it('rejects empty city', () => {
    expect(validate({ ...validRegister, city: '' })).toBe('Введіть місто');
  });

  it('validates fields in order: name → salon → phone → city → email → password', () => {
    const empty: ValidateParams = {
      isRegister: true, name: '', salonName: '', phone: '', city: '', email: '', password: '',
    };
    // First error should be about name
    expect(validate(empty)).toBe("Введіть ваше ім'я");
    // With name, next error is salon
    expect(validate({ ...empty, name: 'Test' })).toBe('Введіть назву салону');
  });
});
