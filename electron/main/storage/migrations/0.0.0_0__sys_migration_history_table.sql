CREATE TABLE sys_migration_history (id TEXT PRIMARY KEY, version TEXT NOT NULL, upgrade_num INTEGER NOT NULL, applied_at TEXT NOT NULL);
