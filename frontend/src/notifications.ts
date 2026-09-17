export async function enableMandatoryNotifications(walletAddress:string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
  const registration = await navigator.serviceWorker.register('/sw.js');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Push notification permission is required for Allocash safety reminders.');
  const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!publicKey) throw new Error('VAPID public key is not configured.');
  const subscription = await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey});
  const api = import.meta.env.VITE_API_URL || 'http://localhost:8787';
  const response = await fetch(`${api}/v1/notifications/subscribe`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({walletAddress,subscription})});
  if (!response.ok) throw new Error('Could not register push notifications.');
  return true;
}
