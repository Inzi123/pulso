/** Almacén clave-valor mínimo sobre IndexedDB: cabe mucho más que en localStorage. */
const DB_NAME = 'hilo'
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T | undefined)
    req.onerror = () => reject(req.error)
  })
}

export async function idbGetMany<T>(keys: string[]): Promise<(T | undefined)[]> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const out: (T | undefined)[] = new Array(keys.length)
    keys.forEach((k, i) => {
      const req = store.get(k)
      req.onsuccess = () => (out[i] = req.result as T | undefined)
    })
    tx.oncomplete = () => resolve(out)
    tx.onerror = () => reject(tx.error)
  })
}

/** Escribe y borra varias claves en una sola transacción. */
export async function idbWrite(puts: [string, unknown][], deletes: string[] = []): Promise<void> {
  const d = await db()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    for (const [k, v] of puts) store.put(v, k)
    for (const k of deletes) store.delete(k)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}
