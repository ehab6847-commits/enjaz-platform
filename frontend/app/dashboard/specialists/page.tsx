'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

interface User {
  id: string;
  fullName: string;
  username: string;
  email: string;
  role: string;
  status: string;
  specialization: string;
  whatsapp: string;
  createdAt: string;
}

export default function SpecialistsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'PENDING' | 'BLOCKED'>('ACTIVE');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAction = async (id: string, action: 'approve' | 'reject' | 'block' | 'unblock') => {
    const confirmMsg = {
      approve: 'هل أنت متأكد من الموافقة على هذا المختص؟',
      reject: 'هل أنت متأكد من رفض/حذف طلب هذا المختص؟',
      block: 'هل أنت متأكد من حظر هذا المختص؟',
      unblock: 'هل أنت متأكد من فك الحظر عن هذا المختص؟',
    }[action];

    if (!confirm(confirmMsg)) return;

    try {
      const token = localStorage.getItem('accessToken');
      let url = '';
      let method = 'PUT';
      
      if (action === 'approve') url = `${process.env.NEXT_PUBLIC_API_URL}/users/${id}/approve`;
      if (action === 'reject') {
        url = `${process.env.NEXT_PUBLIC_API_URL}/users/${id}`;
        method = 'DELETE';
      }
      if (action === 'block' || action === 'unblock') {
        url = `${process.env.NEXT_PUBLIC_API_URL}/users/${id}`;
        method = 'PATCH'; // Assuming we'd add this endpoint, or we can use generic update
      }

      await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        ...(action === 'block' ? { body: JSON.stringify({ status: 'BLOCKED' }) } : {}),
        ...(action === 'unblock' ? { body: JSON.stringify({ status: 'ACTIVE' }) } : {})
      });
      
      fetchUsers();
    } catch (error) {
      console.error(`Error performing action ${action}:`, error);
    }
  };

  const filteredUsers = users.filter(u => u.status === activeTab && u.role !== 'ADMIN');
  const pendingCount = users.filter(u => u.status === 'PENDING').length;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">المختصون</h1>
          <p className="text-slate-400 text-sm mt-1">إدارة حسابات المختصين وطلبات الانضمام</p>
        </div>
        <button
          onClick={fetchUsers}
          className="bg-[#1E293B] hover:bg-[#2D3F55] border border-white/10 text-slate-300 rounded-xl px-4 py-2 text-sm transition-all"
        >
          🔄 تحديث
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/10 pb-4">
        <button
          onClick={() => setActiveTab('ACTIVE')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'ACTIVE' 
              ? 'bg-indigo-600 text-white' 
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          المختصون النشطون
        </button>
        <button
          onClick={() => setActiveTab('PENDING')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
            activeTab === 'PENDING' 
              ? 'bg-indigo-600 text-white' 
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          طلبات الانضمام
          {pendingCount > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{pendingCount}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('BLOCKED')}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
            activeTab === 'BLOCKED' 
              ? 'bg-indigo-600 text-white' 
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          المحظورون
        </button>
      </div>

      {/* Users List */}
      <div className="bg-[#1E293B] border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <span className="text-5xl mb-4">👥</span>
            <p className="text-lg">لا يوجد مستخدمين في هذا القسم</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5 bg-[#0F172A]/50">
                  <th className="text-right px-6 py-4 text-slate-400 text-xs font-medium">الاسم</th>
                  <th className="text-right px-6 py-4 text-slate-400 text-xs font-medium">معلومات الاتصال</th>
                  <th className="text-right px-6 py-4 text-slate-400 text-xs font-medium">التخصص</th>
                  <th className="text-right px-6 py-4 text-slate-400 text-xs font-medium">تاريخ الانضمام</th>
                  <th className="text-right px-6 py-4 text-slate-400 text-xs font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-white font-medium">{user.fullName}</p>
                        <p className="text-slate-500 text-xs">@{user.username}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <p className="text-slate-300 text-sm flex items-center gap-2">
                          <span>📧</span> <span dir="ltr">{user.email}</span>
                        </p>
                        {user.whatsapp && (
                          <p className="text-slate-300 text-sm flex items-center gap-2">
                            <span>📱</span> <span dir="ltr">{user.whatsapp}</span>
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg text-sm">
                        {user.specialization || 'غير محدد'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-sm">
                      {formatDistanceToNow(new Date(user.createdAt), { locale: ar, addSuffix: true })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {activeTab === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleAction(user.id, 'approve')}
                              className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm transition-colors"
                            >
                              موافقة
                            </button>
                            <button
                              onClick={() => handleAction(user.id, 'reject')}
                              className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors"
                            >
                              رفض
                            </button>
                          </>
                        )}
                        {activeTab === 'ACTIVE' && (
                          <>
                            <button
                              onClick={() => handleAction(user.id, 'block')}
                              className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors"
                            >
                              حظر
                            </button>
                          </>
                        )}
                        {activeTab === 'BLOCKED' && (
                          <>
                            <button
                              onClick={() => handleAction(user.id, 'unblock')}
                              className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-lg text-sm transition-colors"
                            >
                              فك الحظر
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
