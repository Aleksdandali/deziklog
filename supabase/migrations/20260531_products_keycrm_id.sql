-- Replace the static `_shared/keycrm-product-map.ts` (UUID → KeyCRM numeric id)
-- with a cached column on products. Reconciliation runs in the stock-sync cron:
-- match KeyCRM products by `sku == products.id` (our UUID) and write the id back.
--
-- Backfill preserves the current static map verbatim, including the legacy case
-- where two DB rows map to the same KeyCRM id (Пакети 100х200), so no UNIQUE
-- constraint — just a plain B-tree index for the reverse lookup.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS keycrm_id INTEGER;

CREATE INDEX IF NOT EXISTS products_keycrm_id_idx
  ON public.products (keycrm_id)
  WHERE keycrm_id IS NOT NULL;

-- Backfill from the legacy static map. Idempotent: re-runs are no-ops once
-- the values match. CASE-by-CASE via VALUES join so a single statement covers all.
UPDATE public.products p
SET keycrm_id = m.kid
FROM (VALUES
  -- Disinfectants & cleaners
  ('881bea8d-37e7-4c20-8033-fb08488fc9ce'::uuid, 101),
  ('1b29b2a4-704a-4245-985c-44bc62fd93ff'::uuid, 102),
  ('34485885-4599-4ee7-be6f-5e46111f3aca'::uuid, 105),
  ('03822aa1-74d6-4543-953f-86e2d0309d2a'::uuid, 86),
  ('3635558f-3b65-4e8e-b594-866d9f609cbc'::uuid, 91),
  ('bceeeb81-ec64-4a88-9d10-294e420bc3f7'::uuid, 94),
  ('33a9a603-74fe-49f5-ac35-664da2583b42'::uuid, 87),
  ('b1dc58e6-e4b0-4390-9682-fbed872b41b7'::uuid, 75),
  ('8ee2614c-8b40-438f-864a-64b7e263b62d'::uuid, 76),
  ('3eeb8617-4904-443f-a49d-2ec8bca5b164'::uuid, 92),
  ('b88b0d42-7299-4298-ae96-2a80f4119da9'::uuid, 82),
  ('3bb38cb5-e5fe-4111-ac7a-5e2b66c4286a'::uuid, 83),
  ('5c6e9969-5552-4ec8-a41e-74866b7dc74e'::uuid, 84),
  -- Containers & accessories
  ('c12bae1f-c1a6-4b59-8b02-5c40641fcaaa'::uuid, 109),
  ('78302330-1399-40b7-ac50-49429822cbb1'::uuid, 88),
  ('5f7afcab-f115-4a84-bafa-93a36ba41a51'::uuid, 89),
  ('42ec8321-d9de-4265-b8c1-2f084c4db52e'::uuid, 74),
  ('206c63be-73b9-46bc-aef5-c27419b9a4b9'::uuid, 73),
  ('81a1fa67-b2d0-4f57-a156-d50c9a96bb92'::uuid, 85),
  -- Sterilization pouches
  ('9e8664b2-477f-4a4f-ba14-6089e1de63cb'::uuid, 90),
  ('429d6301-8eba-421f-a2d4-0dafc26a1887'::uuid, 90),
  ('20b72822-a832-4258-8981-e7408101f2d7'::uuid, 95),
  ('7c712891-427e-408e-a79a-716f2bcc4287'::uuid, 99),
  ('49f9c1b2-ac37-42b7-82db-65d55efa3218'::uuid, 100),
  ('7e7e9196-d7c8-4605-b5b6-598732a6b831'::uuid, 97),
  ('09856cdc-11c9-4e3b-8292-ea2a059d14b1'::uuid, 98),
  ('85e3a868-4911-40de-92ca-bc01022604e1'::uuid, 96),
  -- Sterilizers — Dezik / МізМа
  ('624077e2-4a90-41df-af51-1917d104e106'::uuid, 78),
  ('5dce8cec-141e-4c50-84bb-2d27d6576ad3'::uuid, 70),
  ('f87705e1-1f3e-463e-810e-0c76ba220d20'::uuid, 71),
  ('60154ee3-fee3-448d-9f60-a78971fcff05'::uuid, 93),
  ('02b4a324-b6f5-4691-ba65-16c6a17772fc'::uuid, 69),
  ('ae2ac8ea-056c-46ab-90cf-661fe042bbb5'::uuid, 66),
  ('00d93095-f1eb-4933-aad8-b29203de9a74'::uuid, 67),
  ('9e824f14-6a35-464d-be18-366f50e68b29'::uuid, 68),
  -- Sterilizers — Мікростоп
  ('dd264c02-c437-4064-a67e-f5a4ce9afbf8'::uuid, 77),
  ('6967f1fb-7c53-45ba-a713-2df224ec45ac'::uuid, 79),
  ('018b7f9b-5940-46fe-945b-e03cf4a56513'::uuid, 62),
  ('3a6d8ba3-4a36-4c51-acbb-d377c3d849d2'::uuid, 63),
  ('f6842cbd-445c-44b8-ba63-2da028d66729'::uuid, 80),
  ('dfb12ea3-e5eb-4e69-83f7-485820edbd4a'::uuid, 64),
  ('d7721434-f40b-4700-95df-a2bf82ae55f6'::uuid, 65),
  ('ff2a5658-550f-474c-9933-87e147278666'::uuid, 81)
) AS m(id, kid)
WHERE p.id = m.id
  AND (p.keycrm_id IS DISTINCT FROM m.kid);
