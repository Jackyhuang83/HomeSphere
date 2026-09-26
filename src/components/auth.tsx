'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, onUnauthorized, STATUS_QUERY_KEY } from '@/lib/client-api';
import { useToast } from './toast';

interface AuthContextValue {
  checked: boolean;
  verified: boolean;
  setupRequired: boolean;
  version: string | null;
  openLogin: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  checked: false, verified: false, setupRequired: false, version: null,
  openLogin: () => {}, logout: async () => {},
});

export function useAuth(): AuthContextValue { return useContext(AuthContext); }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [verified, setVerified] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    queryClient.fetchQuery({ queryKey: STATUS_QUERY_KEY, queryFn: () => api.status() })
      .then((s) => {
        if (cancelled) return;
        setVerified(s.verified);
        setSetupRequired(!s.passwordRequired);
        setVersion(s.version);
        setChecked(true);
      })
      .catch(() => { if (!cancelled) setChecked(true); });
    return () => { cancelled = true; };
  }, [queryClient]);

  useEffect(() => onUnauthorized((event) => {
    setSetupRequired((event as CustomEvent).detail === 'setup');
    setVerified(false);
    setModalOpen(true);
  }), []);

  const openLogin = useCallback(() => setModalOpen(true), []);
  const logout = useCallback(async () => {
    try { await api.logout(); } finally {
      setVerified(false);
      toast('已退出登录', 'info');
    }
  }, [toast]);

  const handleLoginSuccess = useCallback(() => {
    setVerified(true);
    setSetupRequired(false);
    setModalOpen(false);
    queryClient.invalidateQueries();
    toast('验证成功', 'success');
  }, [queryClient, toast]);

  return (
    <AuthContext.Provider value={{ checked, verified, setupRequired, version, openLogin, logout }}>
      {children}
      {modalOpen && <LoginModal setupRequired={setupRequired} onSuccess={handleLoginSuccess} onClose={() => setModalOpen(false)} />}
    </AuthContext.Provider>
  );
}

function LoginModal({ setupRequired, onSuccess, onClose }: { setupRequired: boolean; onSuccess: () => void; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const submit = async () => {
    if (!password.trim() || loading) return;
    setLoading(true); setError('');
    try { await api.login(password); onSuccess(); }
    catch (err) {
      setError(err instanceof Error ? err.message : '验证失败');
      setPassword(''); inputRef.current?.focus();
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface-raised rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl" role="dialog" aria-modal="true">
        {setupRequired ? (
          <>
            <h2 className="text-lg font-semibold text-content mb-3">需要配置密码</h2>
            <p className="text-sm text-muted">请先在服务器环境变量中设置 <code className="text-accent">PASSWORD</code>。</p>
          </>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <h2 className="text-lg font-semibold text-content mb-1">HomeSphere</h2>
            <p className="text-sm text-muted mb-4">请输入家庭访问密码</p>
            <input ref={inputRef} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="input w-full" placeholder="密码" autoComplete="current-password" />
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            <button type="submit" className="btn-primary w-full mt-4" disabled={loading || !password.trim()}>
              {loading ? '验证中...' : '进入'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
