CREATE TABLE foods (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    search_text TEXT NOT NULL,
    barcode TEXT,
    saved INTEGER NOT NULL DEFAULT 0 CHECK(saved IN (0,1)),
    payload TEXT NOT NULL
);
CREATE UNIQUE INDEX foods_barcode ON foods(barcode) WHERE barcode IS NOT NULL;
CREATE VIRTUAL TABLE food_search USING fts5(id UNINDEXED, search_text, tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER foods_insert AFTER INSERT ON foods BEGIN
    INSERT INTO food_search(id,search_text) VALUES (new.id,new.search_text);
END;
CREATE TRIGGER foods_delete AFTER DELETE ON foods BEGIN
    DELETE FROM food_search WHERE id=old.id;
END;
CREATE TRIGGER foods_update AFTER UPDATE OF search_text ON foods BEGIN
    DELETE FROM food_search WHERE id=old.id;
    INSERT INTO food_search(id,search_text) VALUES (new.id,new.search_text);
END;
CREATE TABLE logs (
    id TEXT PRIMARY KEY NOT NULL,
    food_id TEXT NOT NULL,
    recorded_at REAL NOT NULL,
    payload TEXT NOT NULL
);
CREATE INDEX logs_date ON logs(recorded_at);
CREATE INDEX logs_food ON logs(food_id,recorded_at);
CREATE TABLE recipes (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL);
CREATE TABLE draft (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
CREATE TABLE search_events (id INTEGER PRIMARY KEY, occurred_at REAL NOT NULL, kind TEXT NOT NULL, query TEXT NOT NULL);
PRAGMA user_version=1;
