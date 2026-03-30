// app/js/config.js

// Environment configuration loaded from /config.js (generated during deployment)
// Fallback values are for local development only
const API_BASE = window.API_BASE_URL || 'http://localhost:3001';
const SPA_ORIGIN = window.SPA_ORIGIN || 'http://localhost:3000';
const UPLOAD_BASE = window.UPLOAD_BASE_URL || SPA_ORIGIN;

export const CONFIG = {
  API_BASE,
  SPA_ORIGIN,

  UPLOAD: {
    MODE: window.UPLOAD_MODE || 'local',
    ENABLE_S3_FALLBACK: String(window.UPLOAD_ENABLE_S3_FALLBACK ?? 'true').toLowerCase() === 'true',
    LOCAL_UPLOAD_URL: `${UPLOAD_BASE}/api/v1/uploads/local`,
    PRESIGN_URL: `${UPLOAD_BASE}/api/v1/uploads/presign`,
    DOWNLOAD_URL: `${UPLOAD_BASE}/api/v1/uploads/download`,
    OBJECT_URL: `${UPLOAD_BASE}/api/v1/uploads/object`
  },

  STATION: {
    NAME:      window.STATION_NAME      || 'Your Radio Station',
    CALL_SIGN: window.STATION_CALL_SIGN || '[CALL SIGN]',
    ADDRESS:   window.STATION_ADDRESS   || '[Street Address, City, State ZIP]',
    LOGO_URL:  window.STATION_LOGO_URL  || ''
  }
};