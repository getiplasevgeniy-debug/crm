import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

const vapidPublicKey = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY || '';

function isPushSupported(): boolean {
  return Platform.OS === 'web'
    && typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

function decodeBase64Url(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function subscriptionKeys(subscription: PushSubscription): { p256dh: string; auth: string } {
  const p256dh = subscription.getKey('p256dh');
  const auth = subscription.getKey('auth');
  if (!p256dh || !auth) throw new Error('Push subscription keys are unavailable');

  const encode = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { p256dh: encode(p256dh), auth: encode(auth) };
}

export async function registerPushNotifications(): Promise<void> {
  if (!isPushSupported()) throw new Error('Push notifications are not supported in this browser');
  if (!vapidPublicKey) throw new Error('Push notifications are not configured yet');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site');

  const registration = await navigator.serviceWorker.register('/push-sw.js');
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeBase64Url(vapidPublicKey) as unknown as BufferSource,
  });
  const keys = subscriptionKeys(subscription);
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) throw new Error('You must be signed in to enable notifications');

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: subscription.endpoint,
    ...keys,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (error) throw new Error('Could not save notification settings');
}

export async function hasPushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration('/push-sw.js');
  return Boolean(await registration?.pushManager.getSubscription());
}

export function pushIsAvailable(): boolean {
  return isPushSupported() && Boolean(vapidPublicKey);
}
