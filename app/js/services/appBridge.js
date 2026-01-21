// app/js/services/appBridge.js
//
// Transitional shared context for ES modules.
// Avoids features reaching into main.js scope (which they cannot do).

let _app = null;

export function setAppBridge(app) {
  _app = app;
  // Optional: makes debugging in DevTools easier.
  globalThis.__RFP_APP__ = app;
  return _app;
}

export function getAppBridge() {
  if (_app) return _app;
  if (globalThis.__RFP_APP__) return globalThis.__RFP_APP__;
  throw new Error("App bridge not initialized yet. main.js must call setAppBridge() before features run.");
}
