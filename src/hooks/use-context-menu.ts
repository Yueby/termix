import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

interface ContextMenuState {
  x: number;
  y: number;
}

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    const closeKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", closeKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", closeKey);
    };
  }, [menu]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const el = menuRef.current;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = menu.x;
    let y = menu.y;
    if (x + w > window.innerWidth) x = menu.x - w;
    if (y + h > window.innerHeight) y = menu.y - h;
    if (x < 0) x = 4;
    if (y < 0) y = 4;

    el.style.transition = "none";
    el.style.opacity = "0";
    el.style.transform = "scale(0.95)";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.visibility = "visible";

    void el.offsetHeight;

    el.style.transition = "opacity 100ms ease-out, transform 100ms ease-out";
    el.style.opacity = "1";
    el.style.transform = "scale(1)";
  }, [menu]);

  const open = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  return { menu, menuRef, open, close };
}
