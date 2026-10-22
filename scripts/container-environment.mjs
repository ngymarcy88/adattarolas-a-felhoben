// Keep the encoded credentials, database and query from the host-run .env.
// Only the network address changes inside the Compose network.
export function containerDatabaseUrl(value) {
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password || url.pathname.length < 2) {
      throw new Error();
    }
    url.hostname = 'postgres';
    url.port = '5432';
    return url.toString();
  } catch {
    throw new Error('Invalid DATABASE_URL for container startup');
  }
}
