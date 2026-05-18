// Our `products.id` (UUID) → KeyCRM internal product id.
// KeyCRM SKUs do not match our UUIDs (KeyCRM uses short sequential strings),
// so any function that needs to cross-reference rows by KeyCRM id must use
// this manual map. Keep in sync with the production KeyCRM catalog.
export const KEYCRM_ID_MAP: Record<string, number> = {
  "c12bae1f-c1a6-4b59-8b02-5c40641fcaaa": 109, // Готовий Box для стерилізації
  "9e8664b2-477f-4a4f-ba14-6089e1de63cb": 90,  // Пакети 100х200 (білі)
  "42ec8321-d9de-4265-b8c1-2f084c4db52e": 74,  // Журнал контролю
  "b1dc58e6-e4b0-4390-9682-fbed872b41b7": 75,  // Dezik Instrum 0,5 л
  "8ee2614c-8b40-438f-864a-64b7e263b62d": 76,  // Dezik Instrum 1л
  "03822aa1-74d6-4543-953f-86e2d0309d2a": 86,  // Деланол 1л
  "33a9a603-74fe-49f5-ac35-664da2583b42": 87,  // Септональ 0.5л
  "5f7afcab-f115-4a84-bafa-93a36ba41a51": 89,  // Контейнер 3л
  "3635558f-3b65-4e8e-b594-866d9f609cbc": 91,  // Деланол 20 мл
  "7e7e9196-d7c8-4605-b5b6-598732a6b831": 97,  // Пакети прозорі 60х100
  "881bea8d-37e7-4c20-8033-fb08488fc9ce": 101, // Біонол 250мл
  "1b29b2a4-704a-4245-985c-44bc62fd93ff": 102, // Біонол 1л
  "78302330-1399-40b7-ac50-49429822cbb1": 88,  // Контейнер 1л
};
