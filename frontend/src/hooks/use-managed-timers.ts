import { useCallback, useEffect, useRef } from "react";

type TimerCallback = (...args: any[]) => void;
type TimeoutId = ReturnType<typeof setTimeout>;
type IntervalId = ReturnType<typeof setInterval>;

/**
 * Screen-scoped timer registry.
 *
 * Every timeout/interval created through this hook is removed from the registry
 * when it finishes and is cancelled when its owning screen unmounts. This keeps
 * delayed tutorial work and counter animations from retaining an old screen.
 */
export function useManagedTimers() {
  const timeouts = useRef(new Set<TimeoutId>());
  const intervals = useRef(new Set<IntervalId>());

  const setManagedTimeout = useCallback((callback: TimerCallback, delay = 0, ...args: any[]): TimeoutId => {
    let timer: TimeoutId;
    timer = globalThis.setTimeout(() => {
      timeouts.current.delete(timer);
      callback(...args);
    }, delay) as TimeoutId;
    timeouts.current.add(timer);
    return timer;
  }, []);

  const clearManagedTimeout = useCallback((timer: TimeoutId | null | undefined) => {
    if (timer == null) return;
    globalThis.clearTimeout(timer);
    timeouts.current.delete(timer);
  }, []);

  const setManagedInterval = useCallback((callback: TimerCallback, delay = 0, ...args: any[]): IntervalId => {
    const timer = globalThis.setInterval(callback, delay, ...args) as IntervalId;
    intervals.current.add(timer);
    return timer;
  }, []);

  const clearManagedInterval = useCallback((timer: IntervalId | null | undefined) => {
    if (timer == null) return;
    globalThis.clearInterval(timer);
    intervals.current.delete(timer);
  }, []);

  useEffect(() => () => {
    for (const timer of timeouts.current) globalThis.clearTimeout(timer);
    for (const timer of intervals.current) globalThis.clearInterval(timer);
    timeouts.current.clear();
    intervals.current.clear();
  }, []);

  return {
    setManagedTimeout,
    clearManagedTimeout,
    setManagedInterval,
    clearManagedInterval,
  };
}
