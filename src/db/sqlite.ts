// Phones (Android/iOS): use the real expo-sqlite. The browser build uses sqlite.web.ts instead
// (Metro picks the .web.ts file automatically for the web build).
export * from 'expo-sqlite';

/** Nothing to load on phones. */
export function prepareDatabase(): Promise<void> {
  return Promise.resolve();
}

/** The demo reset button only exists on the web build. */
export function resetDatabase(_name: string): void {}

export function saveDatabaseNow(_name: string): void {}
