// Picking a photo and getting it into Storage, compressed.
//
// Compression is not a nice-to-have. Supabase's free tier gives 1 GB of storage, and blowing an
// included quota puts the whole ORGANISATION into a grace period — once restrictions land the
// database can go read-only, which means a quota eaten by pictures of the kitchen floor takes the
// kitty down with it. A raw iPhone photo is ~3 MB and a compressed one ~200 KB: the same 1 GB is
// four years of photos instead of four months. See docs/PHOTOS_SCAN_AI.md § Photo storage.
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const BUCKET = 'flathub';
const LONG_EDGE = 1600; // enough to read a bill total or see whether a floor was mopped
const QUALITY = 0.7;

/** Pick one photo from the library. null = the sheet was dismissed. */
export async function pickPhoto(): Promise<string | null> {
  // native: quality < 1 re-encodes to JPEG (smaller, no HEIC); web ignores it, which is what the
  // canvas step below is for — whatever Safari hands us decodes once and re-encodes as JPEG.
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: QUALITY });
  return res.canceled ? null : (res.assets?.[0]?.uri ?? null);
}

/** A picked uri as a JPEG blob of roughly 200 KB. */
export async function compress(uri: string): Promise<Blob> {
  const blob = await (await fetch(uri)).blob();
  // ponytail: native is already a re-encoded JPEG from the picker's `quality`, and there is no
  // canvas off the web. Resizing there needs expo-image-manipulator — add it if real photos from
  // the APK come back too big; the web build is what the six of them are using.
  if (Platform.OS !== 'web' || typeof document === 'undefined') return blob;
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', QUALITY));
  return jpeg ?? blob; // a canvas that refuses to encode must not lose the photo
}

/**
 * Upload under `<household_id>/…`, which is the only thing the Storage policies look at: the first
 * path segment is the tenant. Returns the path to store on the row.
 */
export async function upload(householdId: string, key: string, uri: string): Promise<string> {
  const path = `${householdId}/${key}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, await compress(uri), { contentType: 'image/jpeg', upsert: false });
  // 409: this exact path already landed on an earlier attempt. The id is client-generated, so a
  // retry after a lost response is the same photo — not a second one.
  if (error && !/exists/i.test(error.message)) throw error;
  return path;
}

/** A signed URL to show one. The bucket is private, so there is no public link to leak. */
export async function signed(path: string, seconds = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}
