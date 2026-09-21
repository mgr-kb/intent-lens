// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThresholdSection } from './ThresholdSection';
import { THRESHOLD_SAVE_MS } from '../shared/constants';
let send: ReturnType<typeof vi.fn>;
beforeEach(() => {
 vi.useFakeTimers(); send = vi.fn().mockResolvedValue({ ok: true, data: { ok: true } });
 vi.stubGlobal('chrome', { runtime: { id: 'extension', openOptionsPage: vi.fn().mockResolvedValue(undefined), sendMessage: send } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('uses an accessible native range and debounces rapid changes to the latest value', async () => {
 render(<ThresholdSection initial={0.6} />);
 const slider = screen.getByRole('slider', { name: 'しきい値 0.60' });
 expect(slider.getAttribute('aria-describedby')).toBe('threshold-help threshold-guide');
 expect(screen.getByText('0.55〜0.65: 標準(既定 0.60)')).toBeTruthy();
 expect(document.getElementById('threshold-guide')?.children).toHaveLength(3);
 expect(slider.getAttribute('min')).toBe('0.3'); expect(slider.getAttribute('max')).toBe('0.95');
 expect(slider.getAttribute('step')).toBe('0.05'); expect(slider.getAttribute('type')).toBe('range');
 fireEvent.change(slider, { target: { value: '0.7' } });
 await act(async () => vi.advanceTimersByTimeAsync(100));
 fireEvent.change(slider, { target: { value: '0.8' } });
 expect(slider.getAttribute('aria-valuetext')).toBe('0.80');
 await act(async () => vi.advanceTimersByTimeAsync(THRESHOLD_SAVE_MS - 1));
 expect(send).not.toHaveBeenCalled();
 await act(async () => vi.advanceTimersByTimeAsync(1));
 expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'set-threshold', threshold: 0.8 });
 expect(screen.getByText('しきい値を保存しました。')).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: '既定値に戻す' }));
 await act(async () => vi.advanceTimersByTimeAsync(THRESHOLD_SAVE_MS));
 expect(send).toHaveBeenLastCalledWith({ type: 'set-threshold', threshold: 0.6 });
});
it('reports save errors and lets the same value be retried via reset', async () => {
 send.mockResolvedValueOnce({ ok: false, error: 'storage' });
 render(<ThresholdSection initial={0.8} />);
 fireEvent.click(screen.getByRole('button', { name: '既定値に戻す' }));
 await act(async () => vi.advanceTimersByTimeAsync(THRESHOLD_SAVE_MS));
 expect(screen.getByText(/保存に失敗しました/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: '既定値に戻す' }));
 await act(async () => vi.advanceTimersByTimeAsync(THRESHOLD_SAVE_MS));
 expect(screen.getByText('しきい値を保存しました。')).toBeTruthy();
});
it('flushes an outstanding debounce when the section unmounts', async () => {
 const view = render(<ThresholdSection initial={0.8} />);
 fireEvent.click(screen.getByRole('button', { name: '既定値に戻す' }));
 await act(async () => view.unmount());
 expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'set-threshold', threshold: 0.6 });
});
