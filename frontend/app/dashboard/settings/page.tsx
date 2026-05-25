'use client';

import { useState, useEffect } from 'react';

interface SystemSetting {
  [key: string]: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSetting>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const fetchSettings = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleChange = (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSuccess(false);
    setError('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/settings`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(settings)
      });
      
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        const err = await res.json();
        setError(err.error || 'فشل حفظ الإعدادات');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-white">إعدادات النظام</h1>
        <p className="text-slate-400 text-sm mt-1">تكوين وتخصيص المنصة والمراقبة</p>
      </div>

      <div className="bg-[#1E293B] border border-white/5 rounded-2xl overflow-hidden">
        <form onSubmit={handleSave} className="p-6 space-y-8">
          
          {/* AI Settings */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>🤖</span> إعدادات الذكاء الاصطناعي
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#0F172A] p-5 rounded-xl border border-white/5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  تمكين الذكاء الاصطناعي في التصنيف
                </label>
                <select
                  value={settings.enable_ai_classification || 'true'}
                  onChange={e => handleChange('enable_ai_classification', e.target.value)}
                  className="w-full bg-[#1E293B] border border-white/10 text-white rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500"
                >
                  <option value="true">مفعل (يعتمد على GPT-4o-mini)</option>
                  <option value="false">معطل (يعتمد على الكلمات المفتاحية فقط)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  الحد الأدنى لمستوى الثقة (0.1 - 1.0)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0.1"
                  max="1.0"
                  value={settings.min_confidence_score || '0.5'}
                  onChange={e => handleChange('min_confidence_score', e.target.value)}
                  className="w-full bg-[#1E293B] border border-white/10 text-white rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 text-left"
                  dir="ltr"
                />
                <p className="text-slate-500 text-xs mt-1">أي طلب أقل من هذه النسبة سيتم تجاهله.</p>
              </div>
            </div>
          </div>

          {/* System Settings */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>⚙️</span> إعدادات المنصة
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#0F172A] p-5 rounded-xl border border-white/5">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  اسم المنصة
                </label>
                <input
                  type="text"
                  value={settings.platform_name || 'منصة إنجاز'}
                  onChange={e => handleChange('platform_name', e.target.value)}
                  className="w-full bg-[#1E293B] border border-white/10 text-white rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  تلقي إشعارات عبر بوت التيليجرام
                </label>
                <select
                  value={settings.enable_telegram_notifications || 'true'}
                  onChange={e => handleChange('enable_telegram_notifications', e.target.value)}
                  className="w-full bg-[#1E293B] border border-white/10 text-white rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500"
                >
                  <option value="true">مفعل</option>
                  <option value="false">معطل</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  أرشفة الطلبات بعد (ساعات)
                </label>
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={settings.request_expiry_hours || '24'}
                  onChange={e => handleChange('request_expiry_hours', e.target.value)}
                  className="w-full bg-[#1E293B] border border-white/10 text-white rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 text-left"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  حذف الأرشيف بعد (أيام)
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={settings.archive_retention_days || '7'}
                  onChange={e => handleChange('archive_retention_days', e.target.value)}
                  className="w-full bg-[#1E293B] border border-white/10 text-white rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500 text-left"
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              ⚠️ {error}
            </div>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 text-green-400 text-sm">
              ✅ تم حفظ الإعدادات بنجاح
            </div>
          )}

          <div className="flex justify-end pt-4 border-t border-white/5">
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-medium transition-colors flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  جارٍ الحفظ...
                </>
              ) : (
                'حفظ التغييرات'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
