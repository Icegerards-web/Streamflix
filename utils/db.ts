import { Channel, Category } from '../types';

const DB_NAME = 'StreamFlixDB';
const DB_VERSION = 1;
const STORE_NAME = 'playlist';
const HISTORY_KEY = 'streamflix_history';

interface PlaylistData {
  id: string; // usually 'current'
  categories: Category[];
  allChannels: Channel[];
  timestamp: number;
}

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

export const saveToDB = async (categories: Category[], allChannels: Channel[]): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // We only store one active playlist for now to save space/complexity
    const data: PlaylistData = {
        id: 'current',
        categories,
        allChannels,
        timestamp: Date.now()
    };

    store.put(data);
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error("Failed to save to DB", e);
  }
};

export const loadFromDB = async (): Promise<{ categories: Category[], allChannels: Channel[] } | null> => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get('current');

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
          const result = request.result as PlaylistData;
          if (result) {
              resolve({ categories: result.categories, allChannels: result.allChannels });
          } else {
              resolve(null);
          }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error("Failed to load from DB", e);
    return null;
  }
};

export const clearDB = async (): Promise<void> => {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    // Also clear history
    try {
        localStorage.removeItem(HISTORY_KEY);
    } catch(e) {}
    
    return new Promise((resolve) => {
        tx.oncomplete = () => resolve();
    });
};

// --- HISTORY UTILS ---

export const getHistory = (): Channel[] => {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        return JSON.parse(raw);
    } catch (e) {
        return [];
    }
};

export const addToHistory = (channel: Channel): Channel[] => {
    try {
        let history = getHistory();
        // Remove existing entry of same ID to push to top
        history = history.filter(h => h.id !== channel.id);
        // Add to front
        history.unshift(channel);
        // Limit to 20 items
        if (history.length > 20) history = history.slice(0, 20);
        
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        return history;
    } catch (e) {
        console.warn("Failed to save history", e);
        return [];
    }
};