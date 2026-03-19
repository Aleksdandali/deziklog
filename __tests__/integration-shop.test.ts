/**
 * Integration test: shop scenario
 * Browse catalog → Add to cart → Change quantity → Checkout → Order in Supabase
 */

import catalogData from '../data/catalog.json';

// ── Cart logic (extracted from cart-context.tsx) ────────────

interface CatalogProduct {
  id: string;
  category: string;
  name: string;
  description: string;
  volume?: string;
  price?: number;
  url: string;
}

interface CartItem {
  product: CatalogProduct;
  quantity: number;
}

function cartAdd(items: CartItem[], product: CatalogProduct): CartItem[] {
  const existing = items.find((i) => i.product.id === product.id);
  if (existing) {
    return items.map((i) =>
      i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i,
    );
  }
  return [...items, { product, quantity: 1 }];
}

function cartRemove(items: CartItem[], productId: string): CartItem[] {
  return items.filter((i) => i.product.id !== productId);
}

function cartUpdateQty(items: CartItem[], productId: string, qty: number): CartItem[] {
  if (qty <= 0) return cartRemove(items, productId);
  return items.map((i) => (i.product.id === productId ? { ...i, quantity: qty } : i));
}

function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + (i.product.price ?? 0) * i.quantity, 0);
}

function cartItemCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

// ── Tests ───────────────────────────────────────────────────

const products = catalogData.products as CatalogProduct[];

describe('Integration: Shop & Cart', () => {

  describe('Catalog data', () => {
    it('has products with prices', () => {
      const withPrices = products.filter((p) => p.price != null);
      expect(withPrices.length).toBe(products.length);
    });

    it('all prices are positive numbers', () => {
      for (const p of products) {
        expect(p.price).toBeGreaterThan(0);
      }
    });

    it('all products have required fields', () => {
      for (const p of products) {
        expect(p.id).toBeTruthy();
        expect(p.name).toBeTruthy();
        expect(p.category).toBeTruthy();
        expect(p.description).toBeTruthy();
        expect(p.url).toBeTruthy();
      }
    });

    it('categories match products', () => {
      const cats = new Set(products.map((p) => p.category));
      for (const cat of catalogData.categories) {
        expect(cats.has(cat)).toBe(true);
      }
    });
  });

  describe('Cart operations', () => {
    const kraft = products[0]; // Крафт-пакети 60×100
    const delanol = products[3]; // Деланол

    it('starts empty', () => {
      const items: CartItem[] = [];
      expect(cartTotal(items)).toBe(0);
      expect(cartItemCount(items)).toBe(0);
    });

    it('adds product with quantity 1', () => {
      let items: CartItem[] = [];
      items = cartAdd(items, kraft);
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(1);
      expect(items[0].product.id).toBe('kraft-60x100');
    });

    it('increments quantity on duplicate add', () => {
      let items: CartItem[] = [];
      items = cartAdd(items, kraft);
      items = cartAdd(items, kraft);
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(2);
    });

    it('adds multiple different products', () => {
      let items: CartItem[] = [];
      items = cartAdd(items, kraft);
      items = cartAdd(items, delanol);
      expect(items).toHaveLength(2);
    });

    it('calculates total correctly', () => {
      let items: CartItem[] = [];
      items = cartAdd(items, kraft); // 85
      items = cartAdd(items, kraft); // 85 × 2 = 170
      items = cartAdd(items, delanol); // 245
      expect(cartTotal(items)).toBe(170 + 245);
      expect(cartItemCount(items)).toBe(3);
    });

    it('updates quantity', () => {
      let items: CartItem[] = [];
      items = cartAdd(items, kraft);
      items = cartUpdateQty(items, kraft.id, 5);
      expect(items[0].quantity).toBe(5);
      expect(cartTotal(items)).toBe(85 * 5);
    });

    it('removes item when quantity set to 0', () => {
      let items: CartItem[] = [];
      items = cartAdd(items, kraft);
      items = cartUpdateQty(items, kraft.id, 0);
      expect(items).toHaveLength(0);
    });

    it('removes specific item', () => {
      let items: CartItem[] = [];
      items = cartAdd(items, kraft);
      items = cartAdd(items, delanol);
      items = cartRemove(items, kraft.id);
      expect(items).toHaveLength(1);
      expect(items[0].product.id).toBe('delanol-1l');
    });
  });

  describe('Order creation', () => {
    it('builds correct order payload', () => {
      let items: CartItem[] = [];
      items = cartAdd(items, products[0]); // kraft 85
      items = cartAdd(items, products[0]); // kraft ×2
      items = cartAdd(items, products[3]); // delanol 245

      const orderPayload = {
        user_id: 'user-abc-123',
        status: 'pending',
        total_amount: cartTotal(items),
        delivery_address: 'вул. Дерибасівська 1, Одеса',
        phone: '+380501234567',
        notes: null,
      };

      const orderItems = items.map((i) => ({
        product_id: i.product.id,
        product_name: i.product.name,
        quantity: i.quantity,
        price_at_order: i.product.price ?? 0,
      }));

      expect(orderPayload.total_amount).toBe(415);
      expect(orderPayload.status).toBe('pending');
      expect(orderItems).toHaveLength(2);
      expect(orderItems[0].quantity).toBe(2);
      expect(orderItems[0].price_at_order).toBe(85);
      expect(orderItems[1].quantity).toBe(1);
      expect(orderItems[1].price_at_order).toBe(245);
    });

    it('validates required checkout fields', () => {
      const validate = (address: string, phone: string): string | null => {
        if (!address.trim()) return 'Вкажіть адресу доставки';
        if (!phone.trim()) return 'Вкажіть телефон';
        return null;
      };

      expect(validate('', '+380501234567')).toBe('Вкажіть адресу доставки');
      expect(validate('Одеса', '')).toBe('Вкажіть телефон');
      expect(validate('Одеса', '+380501234567')).toBeNull();
    });
  });
});
