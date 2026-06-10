# Ответ ревьюверу — Guideline 5.1.1(v), submission 3cab7d30

Вставить в App Store Connect → App Review → Reply (или в поле Notes при ресабмите),
после загрузки нового билда.

---

Hello,

Thank you for the detailed feedback on Guideline 5.1.1(v).

We have removed the registration requirement for browsing products. In the new build:

- On the sign-in screen, users can tap "Переглянути каталог без реєстрації" ("Browse the catalog without registration") and freely browse the full product catalog and product detail pages as a guest, including adding items to a local cart — no account or personal information is required.
- Registration is now required only for account-based features, as the guideline permits: placing an order (checkout with delivery details) and the personal sterilization-journal features, which store per-user data.
- We additionally made the "salon name" field optional during profile setup, so registration collects only data relevant to the features that require it.

Steps to verify: launch the app → on the sign-in screen tap "Переглянути каталог без реєстрації" (link below the phone form) → the product catalog opens; products and product details are fully browsable, and items can be added to the cart. Sign-in is requested only when tapping "Оформити замовлення" (checkout).

Thank you for your time reviewing our app.

---

## Чеклист ресабмита

1. `eas login` (аккаунт не залогинен локально)
2. `eas build --platform ios --profile production` — версия остаётся 1.0.10, buildNumber автоинкремент (→ 96)
3. `eas submit --platform ios --latest`
4. В ASC на странице отклонённой отправки: заменить билд на новый (кнопка «Изменить» у объекта) → «Повторно отправить на проверку приложения»
5. Приложить текст ответа выше в переписку с App Review
