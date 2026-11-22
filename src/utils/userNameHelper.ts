import { UserProfile } from '../types';

/**
 * Resolves the user's preferred Calling Name for system-wide greetings,
 * in-app notifications, read receipts, and automated emails.
 *
 * IMPORTANT: Never use Calling Name on official OT (Form 10756) or
 * OP (Form 10610) claim sheets — those always print legal `user.name`.
 */
export function getCallingName(
  user?: Pick<Partial<UserProfile>, 'callingName' | 'name'> | null,
  fallback = 'User'
): string {
  const calling = (user?.callingName || '').trim();
  if (calling) return calling;
  const full = (user?.name || '').trim();
  if (full) return full;
  return fallback;
}
