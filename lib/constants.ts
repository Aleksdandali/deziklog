export const COLORS = {
  primary: '#4b569e',
  primaryDark: '#363f75',
  primaryLight: '#eceef5',

  background: '#FFFFFF',
  surface: '#F8F9FC',
  border: '#E5E7EB',

  text: '#1B1B1B',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',

  success: '#43A047',
  error: '#E53935',
  warning: '#F9A825',

  white: '#FFFFFF',
} as const;

export const STERILIZATION_MODES = {
  dry_heat: [
    { id: 'dh-180-60', temp: 180, duration: 60, label: '180°C / 60 хв' },
    { id: 'dh-160-150', temp: 160, duration: 150, label: '160°C / 150 хв' },
  ],
  autoclave: [
    { id: 'ac-134-5', temp: 134, duration: 5, label: '134°C / 5 хв' },
    { id: 'ac-121-20', temp: 121, duration: 20, label: '121°C / 20 хв' },
  ],
} as const;

export const STERILIZATION_TIPS = [
  {
    text: 'Використовуйте індикатори 5 класу для найточнішого контролю стерилізації',
    link: 'indicators',
  },
  {
    text: 'Розчин Деланолу зберігає активність до 14 діб. Не забувайте вчасно замінювати',
    link: 'delanol',
  },
  {
    text: 'Правильний розмір пакета: 60×100 для фрез, 75×150 для пушера, 100×200 для комбі-набору',
    link: 'kraft-packs',
  },
  {
    text: 'Біонол Форте має мийні властивості — два в одному: дезінфекція + очищення',
    link: 'bionol',
  },
  {
    text: 'Після стерилізації пакет зберігає стерильність до 55 днів',
    link: 'kraft-packs',
  },
  {
    text: 'Інструм очищує метал від нальоту та пригорілостей. Ідеально перед стерилізацією',
    link: 'instrum',
  },
  {
    text: 'Регулярне ТО стерилізатора — запорука коректної роботи та точних результатів',
    link: 'sterilizers',
  },
  {
    text: 'Деланол — єдиний засіб DEZIK зі спороцидною дією. Для холодної стерилізації',
    link: 'delanol',
  },
] as const;
