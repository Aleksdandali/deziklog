-- Employees table
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own employees"
  ON employees FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create employees"
  ON employees FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own employees"
  ON employees FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own employees"
  ON employees FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_employees_user_id ON employees(user_id);

-- Add employee fields to sterilization_sessions
ALTER TABLE sterilization_sessions
ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE sterilization_sessions
ADD COLUMN IF NOT EXISTS employee_name TEXT;
