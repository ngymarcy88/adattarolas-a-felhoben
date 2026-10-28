import type { GalleryFile, GalleryPage } from '../../src/api/gallery';

export const galleryFile = (n = 1, changes: Partial<GalleryFile> = {}): GalleryFile => ({
  id: `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`, originalName: `photo-${n}.jpg`, mimeType: 'image/jpeg',
  detectedMimeType: 'image/jpeg', sizeBytes: 1048576, status: 'ACTIVE', createdAt: '2026-10-28T10:00:00.000Z', ...changes,
});
export const galleryPage = (items = [galleryFile()], nextCursor: string | null = null): GalleryPage => ({ items, nextCursor, hasNextPage: nextCursor !== null });
