import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

interface SafeMapControllerProps {
  points: Array<[number, number]>;
  fitKey: string;
  resetCounter: number;
  defaultCenter: [number, number];
  defaultZoom: number;
  singlePointZoom?: number;
  fitBoundsPadding?: [number, number];
  fitBoundsMaxZoom?: number;
  resetMode?: 'default' | 'fitOrDefault';
}

interface InternalLeafletMap extends L.Map {
  _mapPane?: HTMLElement;
  _animatingZoom?: boolean;
  _loaded?: boolean;
}

const isMapInstanceReady = (map: L.Map): boolean => {
  const internalMap = map as InternalLeafletMap;
  const container = map.getContainer();
  const mapPane = internalMap._mapPane || map.getPane('mapPane');

  return Boolean(
    container &&
      container.isConnected &&
      container.clientWidth > 0 &&
      container.clientHeight > 0 &&
      mapPane &&
      mapPane.isConnected
  );
};

const DEFAULT_PADDING: [number, number] = [44, 44];

export const SafeMapController: React.FC<SafeMapControllerProps> = ({
  points,
  fitKey,
  resetCounter,
  defaultCenter,
  defaultZoom,
  singlePointZoom = 13,
  fitBoundsPadding = DEFAULT_PADDING,
  fitBoundsMaxZoom = 14,
  resetMode = 'default',
}) => {
  const map = useMap();
  const lastFitKeyRef = useRef<string | null>(null);
  const lastResetCounterRef = useRef<number>(resetCounter);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    const internalMap = map as InternalLeafletMap;
    const container = map.getContainer();
    let rafId: number | null = null;

    const scheduleInvalidate = () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!isMountedRef.current || !isMapInstanceReady(map)) return;
        map.invalidateSize({ animate: false, pan: false });
      });
    };

    scheduleInvalidate();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && container) {
      observer = new ResizeObserver(() => {
        scheduleInvalidate();
      });
      observer.observe(container);
    }

    return () => {
      isMountedRef.current = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      if (observer) {
        observer.disconnect();
      }
      // Cancel any active animation/transition timers before unmount so Leaflet
      // never invokes _onZoomTransitionEnd on a detached _mapPane.
      internalMap._animatingZoom = false;
      if (isMapInstanceReady(map)) {
        map.stop();
      }
    };
  }, [map]);

  useEffect(() => {
    let rafId: number | null = null;

    const applyViewport = () => {
      if (!isMountedRef.current || !isMapInstanceReady(map)) return;

      const isReset = resetCounter !== lastResetCounterRef.current;
      const isFitChanged = fitKey !== lastFitKeyRef.current;

      if (!isReset && !isFitChanged) return;

      lastResetCounterRef.current = resetCounter;
      lastFitKeyRef.current = fitKey;

      const internalMap = map as InternalLeafletMap;
      internalMap._animatingZoom = false;
      map.stop();
      map.invalidateSize({ animate: false, pan: false });

      if (isReset && resetMode === 'default') {
        map.setView(defaultCenter, defaultZoom, { animate: false });
        return;
      }

      if (points.length === 0) {
        if (isReset) {
          map.setView(defaultCenter, defaultZoom, { animate: false });
        }
        return;
      }

      if (points.length === 1) {
        map.setView(points[0], singlePointZoom, { animate: false });
        return;
      }

      const bounds = L.latLngBounds(points.map(([lat, lng]) => L.latLng(lat, lng)));
      if (bounds.isValid()) {
        map.fitBounds(bounds, {
          padding: fitBoundsPadding,
          maxZoom: fitBoundsMaxZoom,
          animate: false,
        });
      }
    };

    rafId = requestAnimationFrame(applyViewport);

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [
    map,
    points,
    fitKey,
    resetCounter,
    defaultCenter,
    defaultZoom,
    singlePointZoom,
    fitBoundsPadding,
    fitBoundsMaxZoom,
    resetMode,
  ]);

  return null;
};
