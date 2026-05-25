'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

interface Notification {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  requestId?: string;
  request?: any;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/notifications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // In a real app, you would also listen to socket events here
  }, []);

  const markAsRead = async (id: string) => {
    try {
      const token = localStorage.getItem('accessToken');
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/notifications/${id}/read`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, isRead: true } : n)
      );
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/notifications/read-all`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'NEW_REQUEST': return '📝';
      case 'USER_JOINED': return '👋';
      case 'SYSTEM': return '⚙️';
      default: return '🔔';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">الإشعارات</h1>
          <p className="text-slate-400 text-sm mt-1">
            لديك {notifications.filter(n => !n.isRead).length} إشعار غير مقروء
          </p>
        </div>
        <button
          onClick={markAllAsRead}
          className="bg-[#1E293B] hover:bg-[#2D3F55] border border-white/10 text-slate-300 rounded-xl px-4 py-2 text-sm transition-all"
        >
          ✓ تحديد الكل كمقروء
        </button>
      </div>

      <div className="bg-[#1E293B] border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
             <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <span className="text-5xl mb-4">🔕</span>
            <p className="text-lg">لا توجد إشعارات</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {notifications.map(notification => (
              <div 
                key={notification.id} 
                className={`p-4 flex items-start gap-4 transition-colors ${
                  notification.isRead ? 'bg-[#0F172A]/30' : 'bg-[#1E293B] hover:bg-white/5 cursor-pointer'
                }`}
                onClick={() => !notification.isRead && markAsRead(notification.id)}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${
                  notification.isRead ? 'bg-slate-800 text-slate-500' : 'bg-indigo-500/20 text-indigo-400'
                }`}>
                  {getIcon(notification.type)}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className={`font-medium ${notification.isRead ? 'text-slate-400' : 'text-white'}`}>
                      {notification.message}
                    </h3>
                    <span className="text-slate-500 text-xs whitespace-nowrap">
                      {formatDistanceToNow(new Date(notification.createdAt), { locale: ar, addSuffix: true })}
                    </span>
                  </div>
                  {notification.request && (
                    <p className="text-slate-500 text-sm line-clamp-1 mt-2 p-2 bg-[#0F172A] rounded-lg">
                      "{notification.request.messageText}"
                    </p>
                  )}
                </div>

                {!notification.isRead && (
                  <div className="w-3 h-3 bg-indigo-500 rounded-full flex-shrink-0 mt-2" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
