import * as SQLite from 'expo-sqlite';
import type { Sterilizer, Cycle, UserProfile } from './types';

const db = SQLite.openDatabaseSync('deziklog.db');

export function initDatabase() {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS sterilizers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('dry_heat', 'autoclave')),
      serial_number TEXT,
      photo_uri TEXT,
      maintenance_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cycles (
      id TEXT PRIMARY KEY,
      sterilizer_id TEXT NOT NULL REFERENCES sterilizers(id),
      sterilization_type TEXT NOT NULL,
      temperature INTEGER NOT NULL,
      duration_minutes INTEGER NOT NULL,
      instruments TEXT,
      note TEXT,
      indicator_photo_uri TEXT,
      indicator_result TEXT CHECK(indicator_result IN ('passed', 'failed')),
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      name TEXT NOT NULL DEFAULT '',
      salon_name TEXT,
      salon_address TEXT,
      salon_logo_uri TEXT,
      phone TEXT,
      email TEXT,
      language TEXT NOT NULL DEFAULT 'uk',
      reminder_enabled INTEGER NOT NULL DEFAULT 1,
      reminder_interval_hours INTEGER NOT NULL DEFAULT 2
    );

    INSERT OR IGNORE INTO profile (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS consumption (
      id TEXT PRIMARY KEY,
      cycle_id TEXT REFERENCES cycles(id),
      item_type TEXT NOT NULL CHECK(item_type IN ('pack', 'solution')),
      item_name TEXT,
      quantity INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ── Sterilizers ──────────────────────────────────────────────────────────────

export function getSterilizers(): Sterilizer[] {
  const rows = db.getAllSync<any>('SELECT * FROM sterilizers ORDER BY created_at DESC');
  return rows.map(rowToSterilizer);
}

export function getSterilizer(id: string): Sterilizer | null {
  const row = db.getFirstSync<any>('SELECT * FROM sterilizers WHERE id = ?', [id]);
  return row ? rowToSterilizer(row) : null;
}

export function addSterilizer(s: Omit<Sterilizer, 'id' | 'createdAt'>): string {
  const id = generateId();
  db.runSync(
    'INSERT INTO sterilizers (id, name, type, serial_number, photo_uri, maintenance_date) VALUES (?, ?, ?, ?, ?, ?)',
    [id, s.name, s.type, s.serialNumber ?? null, s.photoUri ?? null, s.maintenanceDate ?? null]
  );
  return id;
}

export function updateSterilizer(id: string, s: Partial<Omit<Sterilizer, 'id' | 'createdAt'>>) {
  db.runSync(
    'UPDATE sterilizers SET name = COALESCE(?, name), type = COALESCE(?, type), serial_number = ?, photo_uri = ?, maintenance_date = ? WHERE id = ?',
    [s.name ?? null, s.type ?? null, s.serialNumber ?? null, s.photoUri ?? null, s.maintenanceDate ?? null, id]
  );
}

export function deleteSterilizer(id: string) {
  db.runSync('DELETE FROM sterilizers WHERE id = ?', [id]);
}

function rowToSterilizer(row: any): Sterilizer {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    serialNumber: row.serial_number ?? undefined,
    photoUri: row.photo_uri ?? undefined,
    maintenanceDate: row.maintenance_date ?? undefined,
    createdAt: row.created_at,
  };
}

// ── Cycles ───────────────────────────────────────────────────────────────────

export function getCycles(filters?: { period?: string; sterilizerId?: string }): Cycle[] {
  let query = `
    SELECT c.*, s.name as sterilizer_name
    FROM cycles c
    LEFT JOIN sterilizers s ON c.sterilizer_id = s.id
    WHERE c.status != 'cancelled'
  `;
  const params: any[] = [];

  if (filters?.sterilizerId) {
    query += ' AND c.sterilizer_id = ?';
    params.push(filters.sterilizerId);
  }

  if (filters?.period) {
    const now = new Date();
    let start: string;
    if (filters.period === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      start = d.toISOString();
    } else if (filters.period === 'month') {
      start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01T00:00:00.000Z`;
    } else if (filters.period === 'quarter') {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      start = d.toISOString();
    } else if (filters.period === 'year') {
      start = `${now.getFullYear()}-01-01T00:00:00.000Z`;
    } else {
      start = '';
    }
    if (start) {
      query += ' AND c.started_at >= ?';
      params.push(start);
    }
  }

  query += ' ORDER BY c.started_at DESC';
  const rows = db.getAllSync<any>(query, params);
  return rows.map(rowToCycle);
}

export function getCycle(id: string): Cycle | null {
  const row = db.getFirstSync<any>(
    `SELECT c.*, s.name as sterilizer_name
     FROM cycles c LEFT JOIN sterilizers s ON c.sterilizer_id = s.id
     WHERE c.id = ?`,
    [id]
  );
  return row ? rowToCycle(row) : null;
}

export function getRecentCycles(limit = 3): Cycle[] {
  const rows = db.getAllSync<any>(
    `SELECT c.*, s.name as sterilizer_name
     FROM cycles c
     LEFT JOIN sterilizers s ON c.sterilizer_id = s.id
     WHERE c.status != 'cancelled'
     ORDER BY c.started_at DESC
     LIMIT ?`,
    [limit]
  );
  return rows.map(rowToCycle);
}

export function addCycle(c: Omit<Cycle, 'id' | 'createdAt' | 'sterilizerName'>): string {
  const id = generateId();
  db.runSync(
    `INSERT INTO cycles (id, sterilizer_id, sterilization_type, temperature, duration_minutes, instruments, note, started_at, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, c.sterilizerId, c.sterilizationType, c.temperature, c.durationMinutes,
     c.instruments ?? null, c.note ?? null, c.startedAt, c.status]
  );
  return id;
}

export function completeCycle(
  id: string,
  indicatorResult: 'passed' | 'failed',
  indicatorPhotoUri?: string,
  note?: string,
  completedAt?: string
) {
  db.runSync(
    `UPDATE cycles SET status = 'completed', indicator_result = ?, indicator_photo_uri = ?, note = COALESCE(?, note), completed_at = ? WHERE id = ?`,
    [indicatorResult, indicatorPhotoUri ?? null, note ?? null, completedAt ?? new Date().toISOString(), id]
  );
}

export function cancelCycle(id: string) {
  db.runSync(`UPDATE cycles SET status = 'cancelled' WHERE id = ?`, [id]);
}

export function getMonthlyStats(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return db.getFirstSync<{ total: number; passed: number; failed: number }>(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN indicator_result = 'passed' THEN 1 ELSE 0 END) as passed,
      SUM(CASE WHEN indicator_result = 'failed' THEN 1 ELSE 0 END) as failed
    FROM cycles
    WHERE status = 'completed'
    AND started_at >= ? AND started_at < ?`,
    [start, end]
  );
}

function rowToCycle(row: any): Cycle {
  return {
    id: row.id,
    sterilizerId: row.sterilizer_id,
    sterilizerName: row.sterilizer_name ?? undefined,
    sterilizationType: row.sterilization_type,
    temperature: row.temperature,
    durationMinutes: row.duration_minutes,
    instruments: row.instruments ?? undefined,
    note: row.note ?? undefined,
    indicatorPhotoUri: row.indicator_photo_uri ?? undefined,
    indicatorResult: row.indicator_result ?? undefined,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    status: row.status,
    createdAt: row.created_at,
  };
}

// ── Profile ──────────────────────────────────────────────────────────────────

export function getProfile(): UserProfile {
  const row = db.getFirstSync<any>('SELECT * FROM profile WHERE id = 1');
  if (!row) {
    return {
      name: '',
      language: 'uk',
      reminderEnabled: true,
      reminderIntervalHours: 2,
    };
  }
  return {
    name: row.name ?? '',
    salonName: row.salon_name ?? undefined,
    salonAddress: row.salon_address ?? undefined,
    salonLogoUri: row.salon_logo_uri ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    language: row.language ?? 'uk',
    reminderEnabled: row.reminder_enabled === 1,
    reminderIntervalHours: row.reminder_interval_hours ?? 2,
  };
}

export function updateProfile(p: Partial<UserProfile>) {
  db.runSync(
    `UPDATE profile SET
      name = COALESCE(?, name),
      salon_name = COALESCE(?, salon_name),
      salon_address = COALESCE(?, salon_address),
      salon_logo_uri = COALESCE(?, salon_logo_uri),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      language = COALESCE(?, language),
      reminder_enabled = COALESCE(?, reminder_enabled),
      reminder_interval_hours = COALESCE(?, reminder_interval_hours)
    WHERE id = 1`,
    [
      p.name ?? null,
      p.salonName ?? null,
      p.salonAddress ?? null,
      p.salonLogoUri ?? null,
      p.phone ?? null,
      p.email ?? null,
      p.language ?? null,
      p.reminderEnabled !== undefined ? (p.reminderEnabled ? 1 : 0) : null,
      p.reminderIntervalHours ?? null,
    ]
  );
}

export function clearAllData() {
  db.execSync(`
    DELETE FROM consumption;
    DELETE FROM cycles;
    DELETE FROM sterilizers;
    UPDATE profile SET name='', salon_name=NULL, salon_address=NULL, salon_logo_uri=NULL, phone=NULL, email=NULL WHERE id=1;
  `);
}

// ── Consumption ──────────────────────────────────────────────────────────────

export function addConsumption(cycleId: string, itemType: 'pack' | 'solution', itemName?: string) {
  const id = generateId();
  db.runSync(
    'INSERT INTO consumption (id, cycle_id, item_type, item_name) VALUES (?, ?, ?, ?)',
    [id, cycleId, itemType, itemName ?? null]
  );
}

export function getMonthlyConsumption(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return db.getFirstSync<{ packs_used: number; solutions_used: number }>(
    `SELECT
      SUM(CASE WHEN item_type = 'pack' THEN quantity ELSE 0 END) as packs_used,
      SUM(CASE WHEN item_type = 'solution' THEN quantity ELSE 0 END) as solutions_used
    FROM consumption
    WHERE created_at >= ? AND created_at < ?`,
    [start, end]
  );
}

export function getSmartSuggestion(): { type: string; message: string; buyUrl: string } | null {
  const now = new Date();
  const stats = getMonthlyConsumption(now.getFullYear(), now.getMonth() + 1);
  if (stats && stats.packs_used >= 50) {
    return {
      type: 'packs',
      message: `Ви використали ~${stats.packs_used} пакетів цього місяця. Час замовити?`,
      buyUrl:
        'https://dezik.com.ua/paketi-dlya-sterilizacii/?utm_source=deziklog&utm_medium=app&utm_campaign=smart_suggestion',
    };
  }
  return null;
}
