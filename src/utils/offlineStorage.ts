import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl?: number;
}

interface OfflineQueueEntry {
  id: string;
  type: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  data: unknown;
  timestamp: number;
}

interface CacheStore extends DBSchema {
  cache: {
    key: string;
    value: CacheEntry;
  };
  offline_queue: {
    key: string;
    value: OfflineQueueEntry;
    indexes: { 'by-timestamp': number };
  };
}

interface OfflineQueuedRequest {
  id: string;
  type: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  data: unknown;
  timestamp: number;
}

const DB_NAME = 'amarshop-offline';
const DB_VERSION = 1;

let db: IDBPDatabase<CacheStore> | null = null;

export const initOfflineStorage = async (): Promise<void> => {
  try {
    db = await openDB<CacheStore>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create cache store
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache');
        }

        // Create offline queue store
        if (!db.objectStoreNames.contains('offline_queue')) {
          const store = db.createObjectStore('offline_queue', { keyPath: 'id' });
          store.createIndex('by-timestamp', 'timestamp');
        }
      },
    });
  } catch (error) {
    console.error('Failed to initialize offline storage:', error);
  }
};

// Cache Operations
export const offlineStorage = {
  // Cache get
  async get<T = unknown>(key: string): Promise<T | null> {
    if (!db) await initOfflineStorage();
    try {
      const item = await db?.get('cache', key);
      if (!item) return null;

      // Check TTL
      if (item.ttl && Date.now() > item.timestamp + item.ttl) {
        await offlineStorage.remove(key);
        return null;
      }

      return item.data as T;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  },

  // Cache set
  async set<T = unknown>(key: string, data: T, ttl?: number): Promise<void> {
    if (!db) await initOfflineStorage();
    try {
      await db?.put('cache', {
        data,
        timestamp: Date.now(),
        ttl,
      }, key);
    } catch (error) {
      console.error('Cache set error:', error);
    }
  },

  // Cache remove
  async remove(key: string): Promise<void> {
    if (!db) await initOfflineStorage();
    try {
      await db?.delete('cache', key);
    } catch (error) {
      console.error('Cache remove error:', error);
    }
  },

  // Cache clear all
  async clear(): Promise<void> {
    if (!db) await initOfflineStorage();
    try {
      await db?.clear('cache');
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  },

  // Queue operations
  async queueRequest(type: 'POST' | 'PUT' | 'DELETE' | 'PATCH', url: string, data?: unknown): Promise<string> {
    if (!db) await initOfflineStorage();
    const id = `${Date.now()}-${Math.random()}`;
    try {
      await db?.add('offline_queue', {
        id,
        type,
        url,
        data,
        timestamp: Date.now(),
      });
      return id;
    } catch (error) {
      console.error('Queue request error:', error);
      throw error;
    }
  },

  // Get all queued requests
  async getQueuedRequests(): Promise<OfflineQueuedRequest[]> {
    if (!db) await initOfflineStorage();
    try {
      return (await db?.getAll('offline_queue')) ?? [];
    } catch (error) {
      console.error('Get queued requests error:', error);
      return [];
    }
  },

  // Process queue (sync when online)
  async processQueue(onlineCallback?: (request: OfflineQueuedRequest) => Promise<unknown>): Promise<void> {
    if (!db) await initOfflineStorage();
    try {
      const requests = (await offlineStorage.getQueuedRequests()) ?? [];

      for (const request of requests) {
        try {
          if (onlineCallback) {
            await onlineCallback(request);
          } else {
            // Default fetch-based sync
            const response = await fetch(request.url, {
              method: request.type,
              headers: { 'Content-Type': 'application/json' },
              body: request.data ? JSON.stringify(request.data) : undefined,
            });

            if (response.ok) {
              await db?.delete('offline_queue', request.id);
            }
          }
        } catch (error) {
          console.error(`Failed to process request ${request.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Process queue error:', error);
    }
  },

  // Remove queued request
  async removeQueuedRequest(id: string): Promise<void> {
    if (!db) await initOfflineStorage();
    try {
      await db?.delete('offline_queue', id);
    } catch (error) {
      console.error('Remove queued request error:', error);
    }
  },

  // Get offline queue size
  async getQueueSize(): Promise<number> {
    if (!db) await initOfflineStorage();
    try {
      return (await db?.count('offline_queue')) || 0;
    } catch (error) {
      console.error('Get queue size error:', error);
      return 0;
    }
  },

  // Get cache size (number of items)
  async getCacheSize(): Promise<number> {
    if (!db) await initOfflineStorage();
    try {
      return (await db?.count('cache')) || 0;
    } catch (error) {
      console.error('Get cache size error:', error);
      return 0;
    }
  },

  // Get storage info
  async getStorageInfo() {
    if (!db) await initOfflineStorage();
    try {
      const cacheSize = await offlineStorage.getCacheSize();
      const queueSize = await offlineStorage.getQueueSize();
      return { cacheSize, queueSize };
    } catch (error) {
      console.error('Get storage info error:', error);
      return { cacheSize: 0, queueSize: 0 };
    }
  },
};