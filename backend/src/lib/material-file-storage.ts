import { readObject, removeObject, saveObject } from './object-storage.js';

export function materialObjectPath(id: string): string {
  return `materials/${id}.pdf`;
}

export async function saveMaterialFile(id: string, buffer: Buffer): Promise<void> {
  await saveObject(materialObjectPath(id), buffer, 'application/pdf');
}

export async function readMaterialFile(id: string): Promise<Buffer | null> {
  return readObject(materialObjectPath(id));
}

export async function removeMaterialFile(id: string): Promise<void> {
  await removeObject(materialObjectPath(id));
}
