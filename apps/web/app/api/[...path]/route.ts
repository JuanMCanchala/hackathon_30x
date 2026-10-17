import { handle } from '@/lib/embedded-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export { handle as GET, handle as POST, handle as OPTIONS };
