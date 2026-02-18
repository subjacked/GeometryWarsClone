import type { ScoreEntry } from "./types";

const STORAGE_KEY = "neon-geometry-rift-highscores-v1";
const SCORE_DB_NAME = "neon-geometry-rift-db";
const SCORE_STORE_NAME = "highscores";

let scoreDbPromise: Promise<IDBDatabase | null> | null = null;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });
}

function openScoreDb(): Promise<IDBDatabase | null> {
  if (!("indexedDB" in window)) return Promise.resolve(null);
  if (scoreDbPromise) return scoreDbPromise;
  scoreDbPromise = new Promise((resolve) => {
    const request = indexedDB.open(SCORE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SCORE_STORE_NAME)) {
        const store = db.createObjectStore(SCORE_STORE_NAME, { keyPath: "id", autoIncrement: true });
        store.createIndex("score", "score", { unique: false });
        store.createIndex("level", "level", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
  return scoreDbPromise;
}

function normalizeScoreEntry(entry: Partial<ScoreEntry>): ScoreEntry | null {
  if (!Number.isFinite(entry.score)) return null;
  const rawName = typeof entry.name === "string" ? entry.name : "ANON";
  const name = rawName.trim().slice(0, 16) || "ANON";
  const level = Number.isFinite(entry.level) ? Math.max(1, Math.floor(entry.level as number)) : 1;
  const date = typeof entry.date === "string" ? entry.date : new Date().toISOString().slice(0, 10);
  return {
    name,
    score: Math.max(0, Math.floor(entry.score as number)),
    level,
    date,
  };
}

function sortAndTrim(entries: ScoreEntry[]): ScoreEntry[] {
  return entries
    .map((entry) => normalizeScoreEntry(entry))
    .filter((entry): entry is ScoreEntry => Boolean(entry))
    .sort((a, b) => b.score - a.score)
    .slice(0, 120);
}

function loadFallbackLocalScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortAndTrim(parsed);
  } catch {
    return [];
  }
}

function saveFallbackLocalScores(entries: ScoreEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sortAndTrim(entries)));
}

export async function loadAllHighscores(): Promise<ScoreEntry[]> {
  const db = await openScoreDb();
  if (!db) return loadFallbackLocalScores();
  try {
    const tx = db.transaction(SCORE_STORE_NAME, "readonly");
    const store = tx.objectStore(SCORE_STORE_NAME);
    const rows = await requestToPromise(store.getAll());
    await txDone(tx);
    return sortAndTrim(rows as ScoreEntry[]);
  } catch {
    return loadFallbackLocalScores();
  }
}

export async function saveHighscore(entry: ScoreEntry): Promise<void> {
  const normalized = normalizeScoreEntry(entry);
  if (!normalized || normalized.score <= 0) return;

  const db = await openScoreDb();
  if (!db) {
    const entries = loadFallbackLocalScores();
    entries.push(normalized);
    saveFallbackLocalScores(entries);
    return;
  }

  try {
    const tx = db.transaction(SCORE_STORE_NAME, "readwrite");
    const store = tx.objectStore(SCORE_STORE_NAME);
    store.add(normalized);
    await txDone(tx);
  } catch {
    const entries = loadFallbackLocalScores();
    entries.push(normalized);
    saveFallbackLocalScores(entries);
  }
}

export function getLevelHighscores(entries: ScoreEntry[], level: number, limit = 10): ScoreEntry[] {
  return entries
    .filter((entry) => entry.level === level)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function getOverallHighscores(entries: ScoreEntry[], limit = 10): ScoreEntry[] {
  return [...entries]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
