import { shallowRef } from 'vue';

/** Account-scoped notifications: late events cannot refresh a different user's gallery. */
export function createGalleryRefreshSignal(currentOwner: () => string | undefined) {
  const request = shallowRef<{ ownerId: string; version: number } | null>(null);
  function notify(ownerId: string) {
    if (!ownerId || currentOwner() !== ownerId) return;
    request.value = { ownerId, version: request.value?.ownerId === ownerId ? request.value.version + 1 : 1 };
  }
  return { request, notify };
}
