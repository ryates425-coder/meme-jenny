/**
 * InstantDB client for the meme app.
 * Handles real-time sync with memes, votes, and storage. App ID is read from
 * VITE_INSTANT_APP_ID (Vite) or NEXT_PUBLIC_INSTANT_APP_ID (Next.js).
 */
import { init } from '@instantdb/react';
import schema from '../instant.schema';

const appId =
  (typeof import.meta !== 'undefined' &&
    (import.meta as { env?: { VITE_INSTANT_APP_ID?: string } }).env?.VITE_INSTANT_APP_ID) ||
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_INSTANT_APP_ID) ||
  '2599b29a-21e9-4e11-91d3-b37ca19b5316';

export const db = init({
  appId,
  schema,
  useDateObjects: true,
});
