import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

let cachedVapidKey: string | null = null;

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

async function fetchVapidPublicKey(): Promise<string> {
  if (cachedVapidKey) return cachedVapidKey;

  const { data: session } = await supabase.auth.getSession();
  const accessToken = session.session?.access_token;
  if (!accessToken) throw new Error('Сессия истекла. Войдите снова.');

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
  const response = await fetch(`${supabaseUrl}/functions/v1/external-crm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action: 'get_vapid_public_key' }),
  });
  if (!response.ok) throw new Error('Не удалось получить ключ уведомлений');
  const result = await response.json();
  if (!result?.public_key) throw new Error('Уведомления не настроены');
  cachedVapidKey = result.public_key as string;
  return cachedVapidKey;
}

export async function registerPushNotifications(): Promise<void> {
  if (!isPushSupported()) throw new Error('Push notifications are not supported in this browser');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site');

  const vapidPublicKey = await fetchVapidPublicKey();
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

export async function unregisterPushNotifications(): Promise<void> {
  if (!isPushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration('/push-sw.js');
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (userId) {
      await supabase.from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', subscription.endpoint);
    }
  }
}

export async function hasPushSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration('/push-sw.js');
  return Boolean(await registration?.pushManager.getSubscription());
}

export async function pushIsAvailable(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    await fetchVapidPublicKey();
    return true;
  } catch {
    return false;
  }
}
