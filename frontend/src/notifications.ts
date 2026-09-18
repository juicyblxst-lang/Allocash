function urlBase64ToUint8Array(value:string){const padding='='.repeat((4-value.length%4)%4);const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');const raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));}
export async function enableMandatoryNotifications(walletAddress:string){
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw new Error('This browser does not support Web Push.');
 const registration=await navigator.serviceWorker.register('/sw.js');
 const permission=await Notification.requestPermission();
 if(permission!=='granted')throw new Error('Notification permission was not granted.');
 const publicKey=import.meta.env.VITE_VAPID_PUBLIC_KEY as string|undefined;
 if(!publicKey)throw new Error('VITE_VAPID_PUBLIC_KEY is not configured.');
 const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(publicKey)});
 const response=await fetch((import.meta.env.VITE_API_URL||'http://localhost:8787')+'/v1/notifications/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({walletAddress,subscription})});
 if(!response.ok)throw new Error('Could not register push notifications.');
 return true;
}
