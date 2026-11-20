'use client';

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Move focus to an element after the next render, once it exists. For
 * controls that replace themselves (a button that opens an inline form, or
 * a panel that appears after an action): call the returned function with a
 * ref in the event handler, and focus lands there after React commits.
 */
export function useFocusAfterRender() {
  const pending = useRef<RefObject<HTMLElement | null> | null>(null);
  useEffect(() => {
    const target = pending.current;
    if (!target) return;
    pending.current = null;
    target.current?.focus();
  });
  return (target: RefObject<HTMLElement | null>) => {
    pending.current = target;
  };
}
