'use client';

import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import api from '@/lib/api';

interface TelegramAccount {
  id: string;
  phone: string;
  isActive: boolean;
  lastSeen: string;
  createdAt: string;
  _count?: {
    groups: number;
  };
}

interface MonitoredGroup {
  id: string;
  groupId: string;
  groupName: string;
  country: string;
  isActive: boolean;
}

export default function TelegramAccountsPage() {
  const [accounts, setAccounts] = useState<TelegramAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [groups, setGroups] = useState<MonitoredGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  
  // Create account modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const fetchAccounts = async () => {
    try {
      const res = await api.get('/telegram/accounts');
      setAccounts(res.data.data || []);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchGroups = async (accountId: string) => {
    setGroupsLoading(true);
    setSelectedAccount(accountId);
    try {
      const res = await api.get(`/telegram/accounts/${accountId}/groups`);
      setGroups(res.data.data || []);
    } catch (error) {
      console.error('Failed to fetch groups:', error);
    } finally {
      setGroupsLoading(false);
    }
  };

  const toggleAccountStatus = async (accountId: string, isActive: boolean) => {
    try {
      await api.post(`/telegram/accounts/${accountId}/toggle`, { isActive: !isActive });
      fetchAccounts();
    } catch (error) {
      console.error('Error toggling account:', error);
    }
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setNewPhone('');
    setOtp('');
    setPassword('');
    setStep('phone');
    setRequiresPassword(false);
    setModalError(null);
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await api.post('/telegram/login/send-code', { phone: newPhone });
      if (res.data && res.data.success) {
        setStep('otp');
      } else {
        setModalError(res.data?.message || 'فشل إرسال رمز التحقق. تأكد من الرقم وصيغته.');
      }
    } catch (error: any) {
      console.error('Error sending code:', error);
      const errMsg = error.response?.data?.message || 'حدث خطأ في الاتصال بالسيرفر.';
      setModalError(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await api.post('/telegram/login/verify-code', { phone: newPhone, code: otp, password });
      const data = res.data;
      if (data.requiresPassword) {
        setRequiresPassword(true);
        setModalError('الحساب محمي بالتحقق بخطوتين. يرجى إدخال كلمة المرور.');
      } else if (data.success) {
        handleCloseModal();
        fetchAccounts();
        alert('تم ربط الحساب وتفعيل البوت بنجاح! 🎉');
      } else {
        setModalError(data.message || 'رمز التحقق غير صحيح.');
      }
    } catch (error: any) {
      console.error('Error verifying code:', error);
      const errMsg = error.response?.data?.message || 'حدث خطأ في الاتصال بالسيرفر.';
      setModalError(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الحساب؟ سيتم إيقاف المراقبة وحذف جميع الجروبات المرتبطة به.')) return;
    try {
      await api.delete(`/telegram/accounts/${id}`);
      fetchAccounts();
      if (selectedAccount === id) setSelectedAccount(null);
    } catch (error) {
      console.error('Error deleting account:', error);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">حسابات تيليجرام</h1>
          <p className="text-slate-400 text-sm mt-1">إدارة الحسابات المربوطة لمراقبة الجروبات</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-2 text-sm transition-all"
        >
          + إضافة حساب جديد
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Accounts List */}
        <div className="lg:col-span-1 space-y-4">
          {loading ? (
             <div className="flex justify-center py-12 bg-[#1E293B] rounded-2xl border border-white/5">
               <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
             </div>
          ) : accounts.length === 0 ? (
            <div className="bg-[#1E293B] rounded-2xl border border-white/5 p-8 text-center text-slate-400">
              لا توجد حسابات مضافة
            </div>
          ) : (
            accounts.map(acc => (
              <div 
                key={acc.id}
                onClick={() => fetchGroups(acc.id)}
                className={`bg-[#1E293B] rounded-2xl border p-4 cursor-pointer transition-all ${
                  selectedAccount === acc.id 
                    ? 'border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]' 
                    : 'border-white/5 hover:border-white/10'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xl border border-blue-500/30">
                      📱
                    </div>
                    <div dir="ltr" className="text-left">
                      <h3 className="text-white font-medium text-right">{acc.phone}</h3>
                      <p className="text-slate-400 text-xs text-right">
                        {acc.lastSeen ? `آخر ظهور: ${formatDistanceToNow(new Date(acc.lastSeen), { locale: ar, addSuffix: true })}` : 'لم يتصل بعد'}
                      </p>
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded-lg text-xs border ${
                    acc.isActive 
                      ? 'bg-green-500/20 text-green-400 border-green-500/30' 
                      : 'bg-red-500/20 text-red-400 border-red-500/30'
                  }`}>
                    {acc.isActive ? 'نشط' : 'متوقف'}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                  <span className="text-slate-400 text-sm">
                    {acc._count?.groups || 0} مجموعات
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleAccountStatus(acc.id, acc.isActive); }}
                      className="px-3 py-1 bg-[#0F172A] hover:bg-white/5 rounded-lg text-slate-300 text-xs border border-white/10 transition-colors"
                    >
                      {acc.isActive ? 'إيقاف' : 'تفعيل'}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteAccount(acc.id); }}
                      className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-red-400 text-xs border border-red-500/20 transition-colors"
                    >
                      حذف
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Groups Details */}
        <div className="lg:col-span-2">
          {!selectedAccount ? (
             <div className="bg-[#1E293B] rounded-2xl border border-white/5 h-full min-h-[300px] flex items-center justify-center text-slate-500">
               اختر حساباً لعرض المجموعات المرتبطة به
             </div>
          ) : (
            <div className="bg-[#1E293B] rounded-2xl border border-white/5 overflow-hidden flex flex-col h-full min-h-[500px]">
              <div className="p-4 border-b border-white/5 bg-[#0F172A]/50 flex items-center justify-between">
                <h2 className="text-white font-medium">المجموعات المراقبة</h2>
                <span className="text-slate-400 text-sm">{groups.length} مجموعات</span>
              </div>
              
              <div className="p-4 flex-1 overflow-y-auto">
                {groupsLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                  </div>
                ) : groups.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    لا توجد مجموعات مسجلة لهذا الحساب. سيتم إضافة المجموعات تلقائياً عند قراءة الرسائل.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {groups.map(group => (
                      <div key={group.id} className="bg-[#0F172A] rounded-xl p-4 border border-white/5">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="text-white font-medium line-clamp-1">{group.groupName || 'مجموعة بدون اسم'}</h4>
                          <span className={`px-2 py-0.5 rounded text-xs border ${
                            group.isActive 
                              ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                              : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                          }`}>
                            {group.isActive ? 'مفعل' : 'معطل'}
                          </span>
                        </div>
                        <p className="text-slate-500 text-xs font-mono mb-3" dir="ltr">{group.groupId}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 text-sm">{group.country || 'دولة غير محددة'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleCloseModal} />
          <div className="relative bg-[#1E293B] border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl transition-all">
            <h3 className="text-xl font-bold text-white mb-2">ربط حساب تيليجرام</h3>
            
            {modalError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-3 text-sm mb-4 text-right">
                ⚠️ {modalError}
              </div>
            )}

            {step === 'phone' ? (
              <>
                <p className="text-slate-400 text-sm mb-6">
                  أدخل رقم الهاتف مع رمز الدولة (مثال: <span dir="ltr">+966554367046</span>). سيتم إرسال رمز تحقق لحسابك.
                </p>
                <form onSubmit={handleSendCode} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">رقم الهاتف</label>
                    <input
                      type="text"
                      dir="ltr"
                      placeholder="+966xxxxxxxxx"
                      value={newPhone}
                      onChange={e => setNewPhone(e.target.value)}
                      className="w-full bg-[#0F172A] border border-white/10 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 text-left"
                      required
                      disabled={submitting}
                    />
                  </div>
                  
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="flex-1 px-4 py-2 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 transition-colors"
                      disabled={submitting}
                    >
                      إلغاء
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center justify-center gap-2"
                      disabled={submitting}
                    >
                      {submitting ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        'إرسال رمز التحقق'
                      )}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <p className="text-slate-400 text-sm mb-6">
                  تم إرسال رمز التحقق إلى حساب تيليجرام الخاص بالرقم <strong dir="ltr">{newPhone}</strong>. يرجى إدخاله أدناه.
                </p>
                <form onSubmit={handleVerifyCode} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">رمز التحقق (OTP)</label>
                    <input
                      type="text"
                      dir="ltr"
                      placeholder="12345"
                      value={otp}
                      onChange={e => setOtp(e.target.value)}
                      className="w-full bg-[#0F172A] border border-white/10 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 text-center font-bold tracking-widest text-lg"
                      required
                      disabled={submitting}
                    />
                  </div>

                  {(requiresPassword || password) && (
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">كلمة مرور التحقق بخطوتين (2FA)</label>
                      <input
                        type="password"
                        dir="ltr"
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full bg-[#0F172A] border border-white/10 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 text-left"
                        disabled={submitting}
                        required={requiresPassword}
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        مطلوب فقط إذا كان حسابك على تيليجرام محمي بكلمة مرور إضافية.
                      </p>
                    </div>
                  )}
                  
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setStep('phone')}
                      className="flex-1 px-4 py-2 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 transition-colors"
                      disabled={submitting}
                    >
                      السابق
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center justify-center gap-2"
                      disabled={submitting}
                    >
                      {submitting ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        'تأكيد وتسجيل الدخول'
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
