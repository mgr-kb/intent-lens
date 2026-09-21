import { useEffect, useRef, useState } from 'react';
import { THRESHOLD_SAVE_MS } from '../shared/constants';
import { thresholdSchema } from '../shared/settings';
import { errorMessage, request, savedSchema } from '../shared/ui/client';
export function useThreshold(initial: number) {
 const [value, setValue] = useState(initial);
 const [notice, setNotice] = useState('');
 const [failed, setFailed] = useState(false);
 const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
 const pending = useRef<number | undefined>(undefined);
 const serial = useRef<Promise<void>>(Promise.resolve());
 const alive = useRef(true);
 const version = useRef(0);
 const persist = () => {
  const threshold = pending.current;
  if (threshold === undefined) return;
  pending.current = undefined;
  const current = version.current;
  serial.current = serial.current.then(async () => {
   try {
    await request({ type: 'set-threshold', threshold }, savedSchema);
    if (alive.current && current === version.current) { setFailed(false); setNotice('しきい値を保存しました。'); }
   } catch (error) {
    if (alive.current && current === version.current) { setFailed(true); setNotice(errorMessage(error)); }
   }
  });
 };
 useEffect(() => {
  alive.current = true;
  return () => { alive.current = false; clearTimeout(timer.current); persist(); };
 }, []);
 const change = (next: number) => {
  if (!thresholdSchema.safeParse(next).success) return;
  version.current += 1; setValue(next); setFailed(false); setNotice('保存しています…');
  pending.current = next; clearTimeout(timer.current);
  timer.current = setTimeout(persist, THRESHOLD_SAVE_MS);
 };
 return { value, notice, failed, change };
}
