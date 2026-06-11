/**
 * Detects if the application is running as a Progressive Web App (PWA)
 * from the user's home screen, covering all major browsers.
 *
 * - `(display-mode: standalone)` → Chrome, Firefox, Edge, modern Safari
 * - `window.navigator.standalone` → legacy iOS Safari (standalone property)
 */
export function isRunningAsPWA() {
  const isStandardStandalone = window.matchMedia('(display-mode: standalone)').matches
  const isIOSStandalone = window.navigator.standalone === true
  return isStandardStandalone || isIOSStandalone
}