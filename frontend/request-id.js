export function requestId() {
  // getRandomValues is also available on the HTTP IP demo entry point.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
