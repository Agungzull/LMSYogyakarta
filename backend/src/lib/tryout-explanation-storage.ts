import { readObject, removeObject, saveObject } from './object-storage.js';

export function explanationObjectPath(filename: string): string {
  return `tryout-explanations/${filename}`;
}

export function explanationContentType(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export async function saveExplanationImage(filename: string, buffer: Buffer): Promise<void> {
  await saveObject(explanationObjectPath(filename), buffer, explanationContentType(filename));
}

export async function readExplanationImage(filename: string): Promise<Buffer | null> {
  return readObject(explanationObjectPath(filename));
}

export async function removeExplanationImage(filename: string): Promise<void> {
  await removeObject(explanationObjectPath(filename));
}

export function questionObjectPath(filename: string): string {
  return `tryout-questions/${filename}`;
}

export async function saveQuestionImage(filename: string, buffer: Buffer): Promise<void> {
  await saveObject(questionObjectPath(filename), buffer, explanationContentType(filename));
}

export async function readQuestionImage(filename: string): Promise<Buffer | null> {
  return readObject(questionObjectPath(filename));
}

export async function removeQuestionImage(filename: string): Promise<void> {
  await removeObject(questionObjectPath(filename));
}
