import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const tryoutExplanationDirectory = fileURLToPath(new URL('../../uploads/tryout-explanations/', import.meta.url));

export function tryoutExplanationFilePath(filename: string) {
  return path.join(tryoutExplanationDirectory, filename);
}
