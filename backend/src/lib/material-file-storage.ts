import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const materialFilesDirectory = fileURLToPath(new URL('../../uploads/materials/', import.meta.url));

export function materialFilePath(id: string) {
  return path.join(materialFilesDirectory, `${id}.pdf`);
}