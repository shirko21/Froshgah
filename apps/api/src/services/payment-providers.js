/**
 * Payment adapter registry.
 * Add online gateways here. Never expose private keys to the web application.
 */
export const paymentProviders = {
  cod: { online: false },
  bank_transfer: { online: false },
  manual: { online: false },
};

export function isSupportedPayment(code) {
  return Object.prototype.hasOwnProperty.call(paymentProviders, code) || /^[a-z0-9_-]{2,40}$/.test(code);
}
