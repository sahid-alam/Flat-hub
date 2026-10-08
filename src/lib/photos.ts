// Where a mate's avatar and cover live. One destination today (Supabase Storage, the private
// `member-photos` bucket); the owner may later want Google Drive, so the two calls a screen needs
// sit behind `PhotoStore` and nothing above this file knows the bucket's name.
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type PhotoKind = 'avatar' | 'cover';

export type PhotoStore = {
  /** Uploads `blob` for this member and returns the key to put on their row. */
  put(householdId: string, memberId: string, kind: PhotoKind, blob: Blob): Promise<string>;
  /** A URL the app can render, or null when the key is gone. */
  url(key: string): Promise<string | null>;
};

const BUCKET = 'member-photos';

/** Fixed per member and kind, so re-uploading replaces the old object instead of orphaning it —
 *  six people replacing a face every few months would otherwise fill the free gigabyte quietly. */
const keyFor = (householdId: string, memberId: string, kind: PhotoKind) =>
  `${householdId}/${memberId}/${kind}.jpg`;

const signed = new Map<string, { url: string; until: number }>();
const SIGN_FOR = 60 * 60; // seconds

export const supabaseStore: PhotoStore = {
  async put(householdId, memberId, kind, blob) {
    const key = keyFor(householdId, memberId, kind);
    const { error } = await supabase.storage.from(BUCKET).upload(key, blob, {
      contentType: 'image/jpeg',
      upsert: true,
      // The path never changes, so a long cache would show the old face after a swap. A minute is
      // enough to stop a scroll re-fetching and short enough that the next visit is current.
      cacheControl: '60',
    });
    if (error) throw error;
    signed.delete(key);
    return key;
  },

  async url(key) {
    const hit = signed.get(key);
    if (hit && hit.until > Date.now()) return hit.url;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(key, SIGN_FOR);
    if (!data?.signedUrl) return null;
    signed.set(key, { url: data.signedUrl, until: Date.now() + (SIGN_FOR - 60) * 1000 });
    return data.signedUrl;
  },
};

/** Pixels on the long edge. An avatar is shown at 84pt, a cover at 132pt tall and full width. */
const MAX_EDGE: Record<PhotoKind, number> = { avatar: 512, cover: 1280 };

export class PhotoError extends Error {}

/**
 * Opens the picker and hands back a JPEG of about 150–250KB. Nothing raw ever reaches the bucket:
 * a straight iPhone photo is 3–5MB, and at that size six people fill the free gigabyte in about
 * four months.
 *
 * HEIC needs no decoder here. iOS Safari transcodes to JPEG at the file input, and
 * `expo-image-picker` does the same on native unless asked for the original representation. If a
 * browser still hands us something it cannot decode (HEIC dragged into desktop Chrome), the draw
 * throws and we say so rather than uploading a file nobody can see.
 * ponytail: no WASM decoder. Add one only if a real photo from the flat fails this.
 */
export async function pickPhoto(kind: PhotoKind): Promise<Blob | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: kind === 'avatar' ? [1, 1] : [16, 9],
    quality: 0.85,
  });
  if (picked.canceled || !picked.assets[0]) return null;
  const asset = picked.assets[0];

  if (Platform.OS === 'web') {
    if (!asset.file) throw new PhotoError('Could not read that photo.');
    return shrink(asset.file, MAX_EDGE[kind]);
  }
  // ponytail: native gets the picker's own crop and quality, no resize — the flat uses the web
  // build. Add expo-image-manipulator here the day a native build ships.
  const res = await fetch(asset.uri);
  return res.blob();
}

/** Draws the file down to `maxEdge` on its long side and re-encodes it as JPEG. */
async function shrink(file: Blob, maxEdge: number): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // from-image: without it a portrait iPhone photo lands on its side, because the EXIF
    // orientation is dropped when we draw it ourselves.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError("That photo's format isn't supported here. A JPEG or PNG works.");
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError('Could not resize that photo.');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
  if (!blob) throw new PhotoError('Could not resize that photo.');
  return blob;
}
