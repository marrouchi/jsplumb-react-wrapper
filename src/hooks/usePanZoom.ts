import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import type { BrowserJsPlumbInstance } from '@jsplumb/community';

interface UsePanZoomOptions {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  instanceRef: React.MutableRefObject<BrowserJsPlumbInstance | null>;
  zoom?: number;
  minZoom: number;
  maxZoom: number;
  zoomStep: number;
}

const usePanZoom = ({
  canvasRef,
  surfaceRef,
  instanceRef,
  zoom: zoomProp,
  minZoom,
  maxZoom,
  zoomStep
}: UsePanZoomOptions) => {
  const [zoomState, setZoomState] = useState(zoomProp ?? 1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const zoomRef = useRef(zoomState);
  const panRef = useRef(pan);
  const panStartRef = useRef<{ x: number; y: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    zoomRef.current = zoomState;
  }, [zoomState]);

  useEffect(() => {
    panRef.current = pan;
    if (surfaceRef.current) {
      surfaceRef.current.style.transform = `translate(${pan.x}px, ${pan.y}px)`;
    }
  }, [pan, surfaceRef]);

  const clampZoom = useCallback((value: number) => Math.min(maxZoom, Math.max(minZoom, value)), [maxZoom, minZoom]);

  const setZoomInternal = useCallback(
    (value: number) => {
      const clamped = clampZoom(value);
      setZoomState((current) => {
        if (current === clamped) {
          return current;
        }
        return clamped;
      });
      zoomRef.current = clamped;
      const instance = instanceRef.current;
      if (instance) {
        const jp = instance as unknown as { setZoom?: (zoom: number, repaint?: boolean) => void };
        jp.setZoom?.(clamped, true);
      }
      return clamped;
    },
    [clampZoom, instanceRef]
  );

  useEffect(() => {
    if (typeof zoomProp === 'number') {
      setZoomInternal(zoomProp);
    }
  }, [setZoomInternal, zoomProp]);

  const handlePanMove = useCallback((event: MouseEvent) => {
    const start = panStartRef.current;
    if (!start) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    setPan({ x: start.originX + dx, y: start.originY + dy });
  }, []);

  const handlePanEnd = useCallback(() => {
    panStartRef.current = null;
    window.removeEventListener('mousemove', handlePanMove);
    window.removeEventListener('mouseup', handlePanEnd);
  }, [handlePanMove]);

  const handleCanvasMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest('.jr-node') || target.closest('.jr-port') || target.closest('.jr-connection-delete-button')) {
        return;
      }
      event.preventDefault();
      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        originX: panRef.current.x,
        originY: panRef.current.y
      };
      window.addEventListener('mousemove', handlePanMove);
      window.addEventListener('mouseup', handlePanEnd);
    },
    [handlePanEnd, handlePanMove]
  );

  useEffect(
    () => () => {
      window.removeEventListener('mousemove', handlePanMove);
      window.removeEventListener('mouseup', handlePanEnd);
    },
    [handlePanEnd, handlePanMove]
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (!canvasRef.current) {
        return;
      }
      const zoomModifier = event.ctrlKey || event.metaKey;
      if (!zoomModifier) {
        return;
      }
      event.preventDefault();
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const pointerX = event.clientX - canvasRect.left;
      const pointerY = event.clientY - canvasRect.top;
      const graphX = (pointerX - panRef.current.x) / zoomRef.current;
      const graphY = (pointerY - panRef.current.y) / zoomRef.current;
      const direction = event.deltaY > 0 ? -1 : 1;
      const nextZoom = setZoomInternal(zoomRef.current + direction * zoomStep);
      const nextPanX = pointerX - graphX * nextZoom;
      const nextPanY = pointerY - graphY * nextZoom;
      setPan({ x: nextPanX, y: nextPanY });
    },
    [canvasRef, setZoomInternal, zoomStep]
  );

  const zoomIn = useCallback(() => {
    setZoomInternal(zoomRef.current + zoomStep);
  }, [setZoomInternal, zoomStep]);

  const zoomOut = useCallback(() => {
    setZoomInternal(zoomRef.current - zoomStep);
  }, [setZoomInternal, zoomStep]);

  const resetZoom = useCallback(() => {
    setPan({ x: 0, y: 0 });
    setZoomInternal(1);
  }, [setZoomInternal]);

  return {
    zoom: zoomState,
    zoomRef,
    pan,
    panRef,
    setPan,
    handleWheel,
    handleCanvasMouseDown,
    setZoom: setZoomInternal,
    zoomIn,
    zoomOut,
    resetZoom
  };
};

export default usePanZoom;
