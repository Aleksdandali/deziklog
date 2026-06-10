# Ответ ревьюверу — Guideline 5.1.1(v), submission 3cab7d30

Вставить в App Store Connect → App Review → Reply после загрузки финального билда.
Перед отправкой заменить (99) на фактический номер билда, который прикреплён к отправке.

---

Hello,

Thank you for the detailed feedback on Guideline 5.1.1(v).

We have removed the registration requirement for browsing products. In the new build:

- The app now opens directly into the product catalog — no sign-in screen, no registration and no personal information is required. Guests can freely browse the full catalog and product detail pages and add items to a local cart.
- Registration is required only for account-based features, as the guideline permits: placing an order (checkout with delivery details) and the personal sterilization-journal features, which store per-user data.
- We additionally made the "salon name" field optional during profile setup, so registration collects only data relevant to the features that require it.

Steps to verify: launch the app — the product catalog is the first screen. Browse products and product details and add items to the cart without signing in. Sign-in is requested only when tapping "Оформити замовлення" (checkout) or opening the sign-in screen via the "Увійти" button.

Thank you for your time reviewing our app.

---

## Чеклист ресабмита

1. `eas build --platform ios --profile production` — версия 1.0.10, buildNumber автоинкремент
   (ВАЖНО: supportsTablet должен оставаться true — убирать поддержку iPad Apple запрещает, QA1623)
2. `eas submit --platform ios --latest`
3. В ASC на странице отклонённой отправки: «Изменить» у объекта → заменить билд на новый
4. Вставить ответ выше в переписку с App Review
5. «Повторно отправить на проверку приложения» — жмёт пользователь
