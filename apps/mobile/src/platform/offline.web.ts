export function enableOfflinePreview() {
  // Do not put Metro/Fast Refresh traffic behind a service worker.
  if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Offline preview unavailable:', error));
  }
}
