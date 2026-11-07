ThumbVault PWA Package

Upload all contents of this folder together to the same directory on an HTTPS website.
Keep this structure:
  index.html
  manifest.json
  service-worker.js
  icons/
    icon.svg
    icon-192.png
    icon-512.png
  css/
    base.css
    capture.css
    history.css
    chart.css
    modals.css
  js/
    state.js
    capture.js
    history.js
    chart.js
    sync.js
    app.js

Android & iOS installation:
1. Open the HTTPS URL in Chrome (Android) or Safari (iOS).
2. Use Chrome menu > Install app (or Safari Share > Add to Home Screen).
3. If an older installation exists, uninstall it, clear the site's data/cache, and reinstall to refresh the icon and manifest.

Cloudflare R2 Worker (GET & POST support for 2-way Sync / Pull / Push):
Make sure your Cloudflare Worker handles both GET (returning the stored JSON object from your R2 bucket) and POST (saving the JSON body to your R2 bucket), with CORS headers allowing 'GET, POST, OPTIONS' and header 'x-vault-key'.

Important:
- Do not open from file://. Manifest and service worker must be served from the same origin; service workers require HTTPS except on localhost.
- The app shell is cached for offline startup; expenses are stored in localStorage on this device.
- The optional R2 token is also stored in localStorage. Export backups regularly.
