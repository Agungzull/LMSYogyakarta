import path from 'node:path';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { del, get, put } from '@vercel/blob';

/**
 * Serverless (Vercel) hanya menyediakan filesystem baca-satu dan /tmp bersifat
 * sementara, jadi file unggahan disimpan di Vercel Blob saat token tersedia.
 * Tanpa token (development lokal) file tetap ditulis ke backend/uploads.
 */
const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const uploadsRoot = path.resolve(fileURLToPath(new URL('../../uploads/', import.meta.url)));

function localPath(pathname: string): string {
  const target = path.resolve(uploadsRoot, pathname);
  if (!target.startsWith(`${uploadsRoot}${path.sep}`)) {
    throw new Error('Path unggahan tidak valid');
  }
  return target;
}

export async function saveObject(pathname: string, buffer: Buffer, contentType: string): Promise<void> {
  if (useBlob) {
    await put(pathname, buffer, { access: 'public', contentType });
    return;
  }

  const target = localPath(pathname);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer, { flag: 'wx' });
}

export async function readObject(pathname: string): Promise<Buffer | null> {
  if (useBlob) {
    const result = await get(pathname, { access: 'public' }).catch(() => null);
    if (!result || result.statusCode !== 200) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }

  try {
    return await readFile(localPath(pathname));
  } catch {
    return null;
  }
}

export async function removeObject(pathname: string): Promise<void> {
  if (useBlob) {
    await del(pathname).catch(() => undefined);
    return;
  }

  await rm(localPath(pathname), { force: true });
}
