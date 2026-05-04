import { useCallback, useEffect, useState, type RefObject } from "react";

export function useFullscreenMode(shellRef: RefObject<HTMLElement | null>) {
  const [fullscreenMode, setFullscreenMode] = useState(false);

  // shellRef is omitted from every dep array below: ref identity never
  // changes, so listing it is dep-list noise (HOOKS F4).
  const exitFullscreen = useCallback(() => {
    const shell = shellRef.current;
    setFullscreenMode(false);
    if (shell && document.fullscreenElement === shell) {
      void document.exitFullscreen?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleFullscreen = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    if (fullscreenMode) {
      exitFullscreen();
      return;
    }
    setFullscreenMode(true);
    if (document.fullscreenEnabled && document.fullscreenElement !== shell) {
      const request = shell.requestFullscreen?.();
      if (request && typeof request.catch === "function") {
        request.catch(() => {
          // The fixed-position fullscreen class remains as the fallback surface.
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exitFullscreen, fullscreenMode]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const handleFullscreenChange = () => {
      if (document.fullscreenElement === shell) {
        setFullscreenMode(true);
      } else if (document.fullscreenElement === null) {
        setFullscreenMode(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { exitFullscreen, fullscreenMode, toggleFullscreen };
}
