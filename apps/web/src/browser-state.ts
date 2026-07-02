const isNorthwindKey = (key: string) => key.startsWith('northwind.') || key.startsWith('northwind-crm-');

function clearOwnedStorage(storage: Storage) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string =>
    Boolean(key),
  );
  keys.filter(isNorthwindKey).forEach((key) => storage.removeItem(key));
}

export async function removeNorthwindOfflineState() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((registration) => new URL(registration.scope).origin === window.location.origin)
        .map((registration) => registration.unregister()),
    );
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.filter(isNorthwindKey).map((key) => caches.delete(key)));
  }
}

export async function clearNorthwindBrowserState() {
  await removeNorthwindOfflineState();
  clearOwnedStorage(localStorage);
  clearOwnedStorage(sessionStorage);
}
