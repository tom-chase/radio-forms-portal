// app/js/config.js

// Environment configuration loaded from /config.js (generated during deployment)
// Fallback values are for local development only
export const CONFIG = {
  API_BASE: window.API_BASE_URL || 'http://localhost:3001',
  SPA_ORIGIN: window.SPA_ORIGIN || 'http://localhost:3000',

  // If upload service is on SPA origin behind Caddy, keep relative.
  // If it lives on another origin, set absolute URL here.
  UPLOAD: {
    PRESIGN_URL: "/api/v1/uploads/presign",
    DOWNLOAD_URL: "/api/v1/uploads/download",
    OBJECT_URL: "/api/v1/uploads/object"
  },

  STATION: {
    NAME:      window.STATION_NAME      || 'Your Radio Station',
    CALL_SIGN: window.STATION_CALL_SIGN || '[CALL SIGN]',
    ADDRESS:   window.STATION_ADDRESS   || '[Street Address, City, State ZIP]',
    LOGO_URL:  window.STATION_LOGO_URL  || ''
  }
};