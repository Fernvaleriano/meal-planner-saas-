import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Push Notifications Hook — Registers for FCM push notifications
 * on native Capacitor builds and stores the device token in Supabase.
 *
 * On web/PWA, this hook is a no-op (Capacitor plugins aren't available).
 */
export function usePushNotifications() {
  const { user } = useAuth();
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!user || registeredRef.current) return;

    let cleanup = false;

    async function registerPush() {
      try {
        // Only run on native Capacitor builds
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform()) return;

        const { PushNotifications } = await import('@capacitor/push-notifications');

        // Check / request permission
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }
        if (permStatus.receive !== 'granted') return;

        // Listen for registration success
        PushNotifications.addListener('registration', async (token) => {
          if (cleanup) return;
          registeredRef.current = true;

          // Store the FCM token in Supabase
          try {
            await fetch('/.netlify/functions/register-push-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: user.id,
                token: token.value,
                platform: Capacitor.getPlatform()
              })
            });
          } catch (e) {
            console.error('Failed to register push token:', e);
          }
        });

        // Listen for registration errors
        PushNotifications.addListener('registrationError', (error) => {
          console.error('Push registration failed:', error);
        });

        // Handle incoming notifications while app is in foreground
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          // Dispatch event so other parts of the app can react
          window.dispatchEvent(new CustomEvent('push-notification', { detail: notification }));
        });

        // Handle notification tap (app opened from notification)
        PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          const data = action.notification.data;
          // Navigate based on notification type
          if (data?.route) {
            window.location.hash = '';
            window.location.pathname = '/app' + data.route;
          }
        });

        // Register with FCM
        await PushNotifications.register();
      } catch (e) {
        // Expected on web — Capacitor plugins not available
      }
    }

    registerPush();

    return () => {
      cleanup = true;
    };
  }, [user]);
}
