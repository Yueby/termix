import { useCallback, useRef } from "react";

const LONG_PRESS_DURATION = 500;

export function useLongPress(
  onLongPress: (e: React.TouchEvent) => void,
  onClick?: () => void
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  const touchStartPos = useRef({ x: 0, y: 0 });

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    isLongPressRef.current = false;
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };

    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      onLongPress(e);
    }, LONG_PRESS_DURATION);
  }, [onLongPress]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartPos.current.x;
    const dy = touch.clientY - touchStartPos.current.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      clear();
    }
  }, [clear]);

  const onTouchEnd = useCallback(() => {
    if (!isLongPressRef.current && onClick) {
      onClick();
    }
    clear();
  }, [clear, onClick]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
