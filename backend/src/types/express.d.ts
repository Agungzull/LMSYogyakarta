declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: 'ADMIN' | 'GURU' | 'SISWA';
        email?: string | null;
        username?: string | null;
      };
    }
  }
}

export {};
