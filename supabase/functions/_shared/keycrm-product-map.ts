// Our `products.id` (UUID) → KeyCRM internal product id.
// KeyCRM SKUs do not match our UUIDs (KeyCRM uses short sequential strings),
// so any function that needs to cross-reference rows by KeyCRM id must use
// this manual map. Keep in sync with the production KeyCRM catalog.
export const KEYCRM_ID_MAP: Record<string, number> = {
  // Disinfectants & cleaners
  "881bea8d-37e7-4c20-8033-fb08488fc9ce": 101, // Bionol 250мл
  "1b29b2a4-704a-4245-985c-44bc62fd93ff": 102, // Bionol 1л
  "34485885-4599-4ee7-be6f-5e46111f3aca": 105, // Delanol 0.5л
  "03822aa1-74d6-4543-953f-86e2d0309d2a": 86,  // Delanol 1л
  "3635558f-3b65-4e8e-b594-866d9f609cbc": 91,  // Delanol 20мл
  "bceeeb81-ec64-4a88-9d10-294e420bc3f7": 94,  // Delanol 250мл
  "33a9a603-74fe-49f5-ac35-664da2583b42": 87,  // Septonal 0.5л
  "b1dc58e6-e4b0-4390-9682-fbed872b41b7": 75,  // Dezik Instrum 0.5л
  "8ee2614c-8b40-438f-864a-64b7e263b62d": 76,  // Dezik Instrum 1л
  "3eeb8617-4904-443f-a49d-2ec8bca5b164": 92,  // Dezik Instrum 250мл
  "b88b0d42-7299-4298-ae96-2a80f4119da9": 82,  // Clean Brash 50мл
  "3bb38cb5-e5fe-4111-ac7a-5e2b66c4286a": 83,  // Clean Brash 100мл
  "5c6e9969-5552-4ec8-a41e-74866b7dc74e": 84,  // Oil Pro (KeyCRM listed as 30ml, DB as 25ml)

  // Containers & accessories
  "c12bae1f-c1a6-4b59-8b02-5c40641fcaaa": 109, // Готовий Box
  "78302330-1399-40b7-ac50-49429822cbb1": 88,  // Контейнер 1л
  "5f7afcab-f115-4a84-bafa-93a36ba41a51": 89,  // Контейнер 3л
  "42ec8321-d9de-4265-b8c1-2f084c4db52e": 74,  // Журнал контролю
  "206c63be-73b9-46bc-aef5-c27419b9a4b9": 73,  // Індикатори (KeyCRM: для сухожру 160шт)
  "81a1fa67-b2d0-4f57-a156-d50c9a96bb92": 85,  // Набір "пилка+баф"

  // Sterilization pouches (white/transparent)
  "9e8664b2-477f-4a4f-ba14-6089e1de63cb": 90,  // Пакети 100х200 (білі — legacy DB row)
  "429d6301-8eba-421f-a2d4-0dafc26a1887": 90,  // Пакети білі 100х200 (canonical DB row)
  "20b72822-a832-4258-8981-e7408101f2d7": 95,  // Пакети білі 75х150
  "7c712891-427e-408e-a79a-716f2bcc4287": 99,  // Пакети прозорі 100х200
  "49f9c1b2-ac37-42b7-82db-65d55efa3218": 100, // Пакети прозорі 150х230
  "7e7e9196-d7c8-4605-b5b6-598732a6b831": 97,  // Пакети прозорі 60х100
  "09856cdc-11c9-4e3b-8292-ea2a059d14b1": 98,  // Пакети прозорі 75х150
  "85e3a868-4911-40de-92ca-bc01022604e1": 96,  // Пакети Plus 60х100 + індикатори

  // Sterilizers — Dezik / МізМа
  "624077e2-4a90-41df-af51-1917d104e106": 78,  // Стерилізатор Dezik ГП 10 від МізМа
  "5dce8cec-141e-4c50-84bb-2d27d6576ad3": 70,  // МізМа ГК 10 (автоклав)
  "f87705e1-1f3e-463e-810e-0c76ba220d20": 71,  // МізМа ГК 20 (автоклав) — клас N (default)
  "60154ee3-fee3-448d-9f60-a78971fcff05": 93,  // МізМа ГК 20 (автоклав) клас B
  "02b4a324-b6f5-4691-ba65-16c6a17772fc": 69,  // МізМа ГП 160 (сухожар)
  "ae2ac8ea-056c-46ab-90cf-661fe042bbb5": 66,  // МізМа ГП 20 (сухожар)
  "00d93095-f1eb-4933-aad8-b29203de9a74": 67,  // МізМа ГП 40 (сухожар)
  "9e824f14-6a35-464d-be18-366f50e68b29": 68,  // МізМа ГП 80 (сухожар)

  // Sterilizers — Мікростоп
  "dd264c02-c437-4064-a67e-f5a4ce9afbf8": 77,  // Мікростоп ГП 10 (сухожар)
  "6967f1fb-7c53-45ba-a713-2df224ec45ac": 79,  // Мікростоп ГП 15 Pro (сухожар)
  "018b7f9b-5940-46fe-945b-e03cf4a56513": 62,  // Мікростоп М1 (сухожар)
  "3a6d8ba3-4a36-4c51-acbb-d377c3d849d2": 63,  // Мікростоп М1+ (сухожар)
  "f6842cbd-445c-44b8-ba63-2da028d66729": 80,  // Мікростоп М1е (сухожар)
  "dfb12ea3-e5eb-4e69-83f7-485820edbd4a": 64,  // Мікростоп М2 (сухожар)
  "d7721434-f40b-4700-95df-a2bf82ae55f6": 65,  // Мікростоп М3 (сухожар)
  "ff2a5658-550f-474c-9933-87e147278666": 81,  // Мікростоп М3+ (сухожар)
};
