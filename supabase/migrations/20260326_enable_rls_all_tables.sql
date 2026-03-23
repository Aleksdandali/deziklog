-- =====================================================
-- Enable RLS on all user-owned tables (idempotent)
-- =====================================================

-- Helper: create policy only if it doesn't exist
DO $$
BEGIN

-- ── profiles ──────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can view own profile') THEN
  CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update own profile') THEN
  CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can insert own profile') THEN
  CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
END IF;

-- ── sterilization_sessions ────────────────────────────
ALTER TABLE sterilization_sessions ENABLE ROW LEVEL SECURITY;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sterilization_sessions' AND policyname = 'Users can view own sessions') THEN
  CREATE POLICY "Users can view own sessions" ON sterilization_sessions FOR SELECT USING (auth.uid() = user_id);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sterilization_sessions' AND policyname = 'Users can create own sessions') THEN
  CREATE POLICY "Users can create own sessions" ON sterilization_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sterilization_sessions' AND policyname = 'Users can update own sessions') THEN
  CREATE POLICY "Users can update own sessions" ON sterilization_sessions FOR UPDATE USING (auth.uid() = user_id);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sterilization_sessions' AND policyname = 'Users can delete own sessions') THEN
  CREATE POLICY "Users can delete own sessions" ON sterilization_sessions FOR DELETE USING (auth.uid() = user_id);
END IF;

-- ── sterilizers ───────────────────────────────────────
ALTER TABLE sterilizers ENABLE ROW LEVEL SECURITY;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sterilizers' AND policyname = 'Users can view own sterilizers') THEN
  CREATE POLICY "Users can view own sterilizers" ON sterilizers FOR SELECT USING (auth.uid() = user_id);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sterilizers' AND policyname = 'Users can create own sterilizers') THEN
  CREATE POLICY "Users can create own sterilizers" ON sterilizers FOR INSERT WITH CHECK (auth.uid() = user_id);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sterilizers' AND policyname = 'Users can update own sterilizers') THEN
  CREATE POLICY "Users can update own sterilizers" ON sterilizers FOR UPDATE USING (auth.uid() = user_id);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sterilizers' AND policyname = 'Users can delete own sterilizers') THEN
  CREATE POLICY "Users can delete own sterilizers" ON sterilizers FOR DELETE USING (auth.uid() = user_id);
END IF;

-- ── instruments ───────────────────────────────────────
ALTER TABLE instruments ENABLE ROW LEVEL SECURITY;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'instruments' AND policyname = 'Users can view own instruments') THEN
  CREATE POLICY "Users can view own instruments" ON instruments FOR SELECT USING (auth.uid() = user_id);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'instruments' AND policyname = 'Users can create own instruments') THEN
  CREATE POLICY "Users can create own instruments" ON instruments FOR INSERT WITH CHECK (auth.uid() = user_id);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'instruments' AND policyname = 'Users can update own instruments') THEN
  CREATE POLICY "Users can update own instruments" ON instruments FOR UPDATE USING (auth.uid() = user_id);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'instruments' AND policyname = 'Users can delete own instruments') THEN
  CREATE POLICY "Users can delete own instruments" ON instruments FOR DELETE USING (auth.uid() = user_id);
END IF;

-- ── solutions ─────────────────────────────────────────
ALTER TABLE solutions ENABLE ROW LEVEL SECURITY;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'solutions' AND policyname = 'Users can view own solutions') THEN
  CREATE POLICY "Users can view own solutions" ON solutions FOR SELECT USING (auth.uid() = user_id);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'solutions' AND policyname = 'Users can create own solutions') THEN
  CREATE POLICY "Users can create own solutions" ON solutions FOR INSERT WITH CHECK (auth.uid() = user_id);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'solutions' AND policyname = 'Users can update own solutions') THEN
  CREATE POLICY "Users can update own solutions" ON solutions FOR UPDATE USING (auth.uid() = user_id);
END IF;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'solutions' AND policyname = 'Users can delete own solutions') THEN
  CREATE POLICY "Users can delete own solutions" ON solutions FOR DELETE USING (auth.uid() = user_id);
END IF;

-- ── products (public read-only) ──────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'products' AND policyname = 'Anyone can view products') THEN
  CREATE POLICY "Anyone can view products" ON products FOR SELECT USING (true);
END IF;

-- ── product_categories (public read-only) ─────────────
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_categories' AND policyname = 'Anyone can view categories') THEN
  CREATE POLICY "Anyone can view categories" ON product_categories FOR SELECT USING (true);
END IF;

END $$;
