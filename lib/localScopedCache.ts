import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { DataScope, getDataScopeKey, ScopedAppData } from './scopedDataFetch';

const DB_NAME = '4kis-local-cache';
const DB_VERSION = 1;
export const LOCAL_CACHE_SCHEMA_VERSION = 2;

export const SCOPED_CACHE_TABLES = [
  'subprojects',
  'ipos',
  'activities',
  'marketingPartners',
  'officeReqs',
  'staffingReqs',
  'otherProgramExpenses',
  'financialObligations',
  'financialDisbursements',
  'referenceUacsList',
  'referenceParticularList',
  'refCommodities',
  'refLivestock',
  'refEquipment',
  'refInputs',
  'refInfrastructure',
  'refTrainings',
  'referenceActivities',
  'deadlines',
  'budgetCeilings',
  'gidaAreas',
  'elcacAreas',
  'activityMonitoringReports',
  'activityMonitoringActions',
  'budgetItemAdjustmentHistory',
] as const;

export type ScopedCacheTable = typeof SCOPED_CACHE_TABLES[number];

export interface CacheMeta {
  scopeKey: string;
  userId: string;
  savedAt: string;
  schemaVersion: number;
  rowCounts: Record<string, number>;
  status: 'complete';
}

interface CachedRecord {
  key: string;
  scopeKey: string;
  userId: string;
  tableName: ScopedCacheTable;
  recordId: string;
  value: any;
}

interface LocalCacheDb extends DBSchema {
  scope_meta: {
    key: string;
    value: CacheMeta;
    indexes: {
      userId: string;
      savedAt: string;
    };
  };
  records: {
    key: string;
    value: CachedRecord;
    indexes: {
      scopeKey: string;
      userId: string;
      tableName: ScopedCacheTable;
    };
  };
}

const isBrowserCacheAvailable = () =>
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

let dbPromise: Promise<IDBPDatabase<LocalCacheDb>> | null = null;

const getDb = async () => {
  if (!isBrowserCacheAvailable()) return null;
  if (!dbPromise) {
    dbPromise = openDB<LocalCacheDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('scope_meta')) {
          const scopeMeta = db.createObjectStore('scope_meta', { keyPath: 'scopeKey' });
          scopeMeta.createIndex('userId', 'userId');
          scopeMeta.createIndex('savedAt', 'savedAt');
        }

        if (!db.objectStoreNames.contains('records')) {
          const records = db.createObjectStore('records', { keyPath: 'key' });
          records.createIndex('scopeKey', 'scopeKey');
          records.createIndex('userId', 'userId');
          records.createIndex('tableName', 'tableName');
        }
      },
    });
  }
  return dbPromise;
};

const getUserId = (scope: DataScope) => String(scope.requestedBy || 'anonymous');

const makeRecordKey = (scopeKey: string, tableName: ScopedCacheTable, recordId: string) =>
  `${scopeKey}::${tableName}::${recordId}`;

const getRecordId = (row: any, index: number) => {
  if (row?.id !== undefined && row?.id !== null) return String(row.id);
  if (row?.uid) return String(row.uid);
  return `row-${index}`;
};

const emptyScopedData = (): ScopedAppData => ({
  subprojects: [],
  ipos: [],
  activities: [],
  marketingPartners: [],
  officeReqs: [],
  staffingReqs: [],
  otherProgramExpenses: [],
  financialObligations: [],
  financialDisbursements: [],
  referenceUacsList: [],
  referenceParticularList: [],
  refCommodities: [],
  refLivestock: [],
  refEquipment: [],
  refInputs: [],
  refInfrastructure: [],
  refTrainings: [],
  referenceActivities: [],
  deadlines: [],
  budgetCeilings: [],
  gidaAreas: [],
  elcacAreas: [],
  activityMonitoringReports: [],
  activityMonitoringActions: [],
  budgetItemAdjustmentHistory: [],
});

export const getScopeCacheMeta = async (scope: DataScope): Promise<CacheMeta | null> => {
  const db = await getDb();
  if (!db) return null;
  const scopeKey = getDataScopeKey(scope);
  const meta = await db.get('scope_meta', scopeKey);
  if (!meta || meta.schemaVersion !== LOCAL_CACHE_SCHEMA_VERSION) return null;
  return meta;
};

export const readScopedCache = async (scope: DataScope): Promise<ScopedAppData | null> => {
  const db = await getDb();
  if (!db) return null;
  const meta = await getScopeCacheMeta(scope);
  if (!meta) return null;

  const rows = await db.getAllFromIndex('records', 'scopeKey', meta.scopeKey);
  const next = emptyScopedData();
  rows.forEach(row => {
    (next[row.tableName] as any[]).push(row.value);
  });
  return next;
};

export const writeScopedCache = async (scope: DataScope, data: ScopedAppData): Promise<CacheMeta | null> => {
  const db = await getDb();
  if (!db) return null;

  const scopeKey = getDataScopeKey(scope);
  const userId = getUserId(scope);
  const savedAt = new Date().toISOString();
  const rowCounts: Record<string, number> = {};
  const tx = db.transaction(['scope_meta', 'records'], 'readwrite');

  const existing = await tx.objectStore('records').index('scopeKey').getAllKeys(scopeKey);
  await Promise.all(existing.map(key => tx.objectStore('records').delete(key)));

  for (const tableName of SCOPED_CACHE_TABLES) {
    const rows = ((data as any)[tableName] || []) as any[];
    rowCounts[tableName] = rows.length;
    rows.forEach((row, index) => {
      const recordId = getRecordId(row, index);
      tx.objectStore('records').put({
        key: makeRecordKey(scopeKey, tableName, recordId),
        scopeKey,
        userId,
        tableName,
        recordId,
        value: row,
      });
    });
  }

  const meta: CacheMeta = {
    scopeKey,
    userId,
    savedAt,
    schemaVersion: LOCAL_CACHE_SCHEMA_VERSION,
    rowCounts,
    status: 'complete',
  };
  tx.objectStore('scope_meta').put(meta);
  await tx.done;
  return meta;
};

export const clearUserCache = async (userId: string | number): Promise<void> => {
  const db = await getDb();
  if (!db) return;
  const normalizedUserId = String(userId || 'anonymous');
  const tx = db.transaction(['scope_meta', 'records'], 'readwrite');
  const metaKeys = await tx.objectStore('scope_meta').index('userId').getAllKeys(normalizedUserId);
  const recordKeys = await tx.objectStore('records').index('userId').getAllKeys(normalizedUserId);
  await Promise.all([
    ...metaKeys.map(key => tx.objectStore('scope_meta').delete(key)),
    ...recordKeys.map(key => tx.objectStore('records').delete(key)),
  ]);
  await tx.done;
};

export const clearAllCache = async (): Promise<void> => {
  const db = await getDb();
  if (!db) return;
  const tx = db.transaction(['scope_meta', 'records'], 'readwrite');
  tx.objectStore('scope_meta').clear();
  tx.objectStore('records').clear();
  await tx.done;
};
