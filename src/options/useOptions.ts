import { useEffect, useRef, useState } from 'react';
import { errorMessage, request, savedSchema, settingsSchema } from '../shared/ui/client';
import { MOCK, THRESHOLD_DEFAULT } from '../shared/constants';
import type { Message } from '../shared/messages';
export function useOptions() {
 const [keyConfigured, setKeyConfigured] = useState(false);
 const [threshold, setThreshold] = useState(THRESHOLD_DEFAULT);
 const [mock, setMock] = useState(MOCK);
 const [ready, setReady] = useState(false);
 const [busy, setBusy] = useState(false);
 const [notice, setNotice] = useState('設定を読み込んでいます…');
 const [failed, setFailed] = useState(false);
 const alive = useRef(false); const working = useRef(false);
 const load = async () => {
  try {
   const settings = await request({ type: 'get-settings' }, settingsSchema);
   if (!alive.current) return;
   setThreshold(settings.threshold); setKeyConfigured(settings.keyConfigured); setMock(settings.mock); setReady(true); setNotice(''); setFailed(false);
  } catch (error) { if (alive.current) { setNotice(errorMessage(error)); setFailed(true); } }
 };
 useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; }; }, []);
 const perform = async (message: Message, success: string): Promise<boolean> => {
  if (!ready || working.current) return false;
  working.current = true; setBusy(true); setFailed(false);
  setNotice(message.type === 'save-key' ? '接続を確認しています…' : '保存しています…');
  try {
   await request(message, savedSchema);
   if (alive.current) setNotice(success); return true;
  } catch (error) {
   if (alive.current) { setFailed(true); setNotice(errorMessage(error)); } return false;
  } finally { working.current = false; if (alive.current) setBusy(false); }
 };
 const saveKey = async (key: string): Promise<boolean> => {
  const saved = await perform({ type: 'save-key', key: key.trim() }, 'APIキーを保存しました。接続確認が完了しました。');
  if (saved && alive.current) setKeyConfigured(true); return saved;
 };
 const deleteKey = async (): Promise<boolean> => {
  const deleted = await perform({ type: 'delete-key' }, 'APIキーを削除しました。');
  if (deleted && alive.current) setKeyConfigured(false); return deleted;
 };
 return { threshold, keyConfigured, mock, ready, busy, notice, failed, load, saveKey, deleteKey };
}
