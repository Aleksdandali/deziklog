/**
 * One-time migration: download product images from external dezik.com.ua URLs
 * and upload to the Supabase `product-images` bucket.
 *
 * Run:  npx tsx scripts/migrate-product-images.ts
 *
 * Requires .env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Outputs `scripts/migrate-product-images.failed.json` for URLs that 404'd.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}

const BUCKET = 'product-images';
const TIMEOUT_MS = 10000;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface ProductRow {
  id: string;
  name: string;
  image_path: string | null;
}

interface Failed {
  id: string;
  name: string;
  url: string;
  reason: string;
}

function extFromContentType(ct: string | null): string {
  if (!ct) return 'jpg';
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  return 'jpg';
}

function contentTypeFromExt(ext: string): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log('Fetching products with image_path…');
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, image_path')
    .not('image_path', 'is', null);

  if (error) {
    console.error('Failed to fetch products:', error);
    process.exit(1);
  }

  const rows = (products ?? []) as ProductRow[];
  console.log(`Found ${rows.length} products with image_path`);

  // Skip already-migrated rows
  const externalRows = rows.filter(
    (r) => r.image_path && !r.image_path.includes(`${SUPABASE_URL!.split('//')[1].split('.')[0]}.supabase.co/storage/`),
  );
  console.log(`${externalRows.length} need migration (rest already on Supabase Storage)`);

  let migrated = 0;
  const failed: Failed[] = [];

  for (const row of externalRows) {
    const url = row.image_path!;
    process.stdout.write(`  ${row.name.slice(0, 40).padEnd(40)} … `);
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        failed.push({ id: row.id, name: row.name, url, reason: `HTTP ${res.status}` });
        console.log(`FAIL (${res.status})`);
        continue;
      }
      const ext = extFromContentType(res.headers.get('content-type'));
      const arrayBuffer = await res.arrayBuffer();
      const objectPath = `${row.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(objectPath, new Uint8Array(arrayBuffer), {
          contentType: contentTypeFromExt(ext),
          upsert: true,
        });

      if (uploadError) {
        failed.push({ id: row.id, name: row.name, url, reason: `upload: ${uploadError.message}` });
        console.log(`FAIL (upload: ${uploadError.message})`);
        continue;
      }

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
      const newUrl = pub.publicUrl;

      const { error: updateError } = await supabase
        .from('products')
        .update({ image_path: newUrl })
        .eq('id', row.id);

      if (updateError) {
        failed.push({ id: row.id, name: row.name, url, reason: `db: ${updateError.message}` });
        console.log(`FAIL (db: ${updateError.message})`);
        continue;
      }

      migrated++;
      console.log('OK');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failed.push({ id: row.id, name: row.name, url, reason: msg });
      console.log(`FAIL (${msg})`);
    }
  }

  const failedPath = path.resolve(__dirname, 'migrate-product-images.failed.json');
  fs.writeFileSync(failedPath, JSON.stringify(failed, null, 2));

  console.log(`\nMigrated: ${migrated} / ${externalRows.length}.  Failed: ${failed.length}`);
  if (failed.length) console.log(`Failed report: ${failedPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
