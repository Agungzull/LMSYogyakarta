import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { dashboardPathFor, type SessionRole } from '@/lib/session';

const ROLES: SessionRole[] = ['ADMIN', 'GURU', 'SISWA'];

export default function DashboardRoot() {
  const role = headers().get('x-lms-role') as SessionRole | null;
  redirect(role && ROLES.includes(role) ? dashboardPathFor(role) : '/login');
}
