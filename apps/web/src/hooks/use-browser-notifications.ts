'use client';

import { useEffect, useRef } from 'react';
import { useNotifications } from './use-data';

/**
 * Bridges in-app notifications to the browser Notification API. New unread
 * notifications (arriving after mount) trigger a native notification when
 * the user has granted permission.
 */
export function useBrowserNotifications() {
  const { data: notifications } = useNotifications();
  const seenIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      // Request permission lazily after first user interaction
      const requestOnce = () => {
        void Notification.requestPermission();
        window.removeEventListener('click', requestOnce);
      };
      window.addEventListener('click', requestOnce, { once: true });
      return () => window.removeEventListener('click', requestOnce);
    }
  }, []);

  useEffect(() => {
    if (!notifications) return;
    if (seenIds.current === null) {
      // First load: mark everything as seen without notifying
      seenIds.current = new Set(notifications.map((n) => n.id));
      return;
    }
    for (const n of notifications) {
      if (!seenIds.current.has(n.id)) {
        seenIds.current.add(n.id);
        if (
          !n.readAt &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          try {
            new Notification(n.title, { body: n.body, tag: n.id });
          } catch {
            // Some platforms (mobile) require a service worker; ignore
          }
        }
      }
    }
  }, [notifications]);
}
