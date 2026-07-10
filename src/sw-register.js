// Registers the built service worker (dist/sw.js) in production only, and
// shows a persistent banner when a new version has finished installing and
// is waiting to take over. Never runs under `npm run dev`.
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((registration) => {
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener('statechange', () => {
        // 'installed' with an existing controller means this is an update,
        // not the very first install — the new worker is now waiting.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(installing);
        }
      });
    });
  });

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

function showUpdateBanner(waitingWorker) {
  const banner = document.getElementById('update-banner');
  const button = document.getElementById('update-banner-refresh');
  if (!banner || !button) return;
  banner.classList.add('visible');
  button.addEventListener('click', () => waitingWorker.postMessage({ type: 'SKIP_WAITING' }), { once: true });
}
