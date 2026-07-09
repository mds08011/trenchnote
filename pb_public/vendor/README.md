# Vendored libraries

These are committed to the repo on purpose: TrenchNote must work with zero
external requests at runtime — on a LAN in a job trailer, on a bad-reception
dirt lot, and for self-hosters with no reliable internet. Never replace these
with CDN `<script>` tags.

| File            | Library                                            | Version | License |
|-----------------|----------------------------------------------------|---------|---------|
| `alpine.min.js` | [Alpine.js](https://github.com/alpinejs/alpine)    | 3.14.1  | MIT     |
| `qrcode.min.js` | [qrcodejs](https://github.com/davidshimjs/qrcodejs)| 1.0.0   | MIT     |
| `jsQR.min.js`   | [jsQR](https://github.com/cozmo/jsQR)              | 1.4.0   | Apache-2.0 |

`jsQR.min.js` is the QR-decode fallback for browsers without the native
BarcodeDetector API (iOS Safari). It is deliberately NOT in the service
worker precache and NOT loaded by any `<script>` tag — scan.html injects it
lazily only when needed, so Chrome/Android never download it (ADR 0009).

To upgrade: download the new minified build, replace the file, update this
table, and test the pages on a phone before committing.
