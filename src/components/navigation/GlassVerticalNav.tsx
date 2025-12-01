'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Gift, Home, Send, User } from 'lucide-react';
import styles from './GlassVerticalNav.module.css';

type NavItem = {
  id: string;
  icon: LucideIcon;
  label?: string;
};

type GlassVerticalNavProps = {
  activeIndex: number;
  onChange?: (index: number) => void;
  className?: string;
  items?: NavItem[];
};

const DEFAULT_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'profile', label: 'Perfil', icon: User },
  { id: 'gift', label: 'Presentes', icon: Gift },
  { id: 'send', label: 'Enviar', icon: Send },
];

const ITEM_SIZE = 22; // px
const GAP = 36; // px
const THUMB_HEIGHT = 64; // px
const THUMB_WIDTH = 38; // px
const STEP = ITEM_SIZE + GAP;
const SHELL_PADDING_TOP = 14; // px
const THUMB_TOP = SHELL_PADDING_TOP - (THUMB_HEIGHT - ITEM_SIZE) / 2;

// Horizontal (mobile) variant
const H_ITEM_SIZE = 18; // px
const H_GAP = 42; // px
const H_THUMB_WIDTH = 76; // px
const H_THUMB_HEIGHT = 68; // px
const H_STEP = H_ITEM_SIZE + H_GAP;
const H_SHELL_PADDING = 26; // px
const H_THUMB_LEFT = (index: number) => H_SHELL_PADDING + index * H_STEP + H_ITEM_SIZE / 2 - H_THUMB_WIDTH / 2;

export function GlassVerticalNav({ activeIndex, onChange, className, items }: GlassVerticalNavProps) {
  const resolvedItems = useMemo(() => (items?.length ? items : DEFAULT_ITEMS), [items]);
  const clampedIndex = useMemo(() => {
    if (Number.isNaN(activeIndex)) return 0;
    return Math.min(Math.max(activeIndex, 0), resolvedItems.length - 1);
  }, [activeIndex, resolvedItems]);

  const thumbTranslateY = clampedIndex * STEP;
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    setAnimKey((key) => key + 1);
  }, [clampedIndex]);

  const cssVars = useMemo<CSSProperties>(
    () => ({
      ['--nav-item-size' as const]: `${ITEM_SIZE}px`,
      ['--nav-gap' as const]: `${GAP}px`,
      ['--nav-thumb-size' as const]: `${THUMB_HEIGHT}px`,
      ['--nav-thumb-width' as const]: `${THUMB_WIDTH}px`,
      ['--nav-shell-padding' as const]: `${SHELL_PADDING_TOP}px`,
      ['--nav-thumb-top' as const]: `${THUMB_TOP}px`,
    }),
    []
  );

  return (
    <div className={[styles.wrapper, className].filter(Boolean).join(' ')} style={cssVars}>
      <div className={styles.glow} aria-hidden />
      <div className={styles.shell}>
        <div className={styles.track} aria-hidden />
        <div
          className={styles.thumb}
          style={{
            transform: `translate(-50%, ${thumbTranslateY}px)`,
            ['--thumb-y' as const]: `${thumbTranslateY}px`,
            animation: animKey ? 'thumbLiquid 720ms cubic-bezier(0.22, 0.88, 0.32, 1.08)' : undefined,
          }}
          aria-hidden
        />

        <div className={styles.items}>
          {resolvedItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = index === clampedIndex;
            const label = item.label ?? item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={label}
                aria-pressed={isActive}
                onClick={() => onChange?.(index)}
                className={[styles.button, isActive ? styles.buttonActive : null]
                  .filter(Boolean)
                  .join(' ')}
                data-tooltip={label}
              >
                <Icon strokeWidth={1.6} size={24} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function GlassHorizontalNav({ activeIndex, onChange, className, items }: GlassVerticalNavProps) {
  const resolvedItems = useMemo(() => (items?.length ? items : DEFAULT_ITEMS), [items]);
  const clampedIndex = useMemo(() => {
    if (Number.isNaN(activeIndex)) return 0;
    return Math.min(Math.max(activeIndex, 0), resolvedItems.length - 1);
  }, [activeIndex, resolvedItems]);

  const thumbTranslateX = H_THUMB_LEFT(clampedIndex);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    setAnimKey((key) => key + 1);
  }, [clampedIndex]);

  const itemsWidth = useMemo(
    () => resolvedItems.length * H_ITEM_SIZE + (resolvedItems.length - 1) * H_GAP,
    [resolvedItems.length]
  );

  const totalWidth = useMemo(() => itemsWidth + H_SHELL_PADDING * 2, [itemsWidth]);

  const cssVars = useMemo<CSSProperties>(
    () => ({
      ['--nav-item-size' as const]: `${H_ITEM_SIZE}px`,
      ['--nav-gap' as const]: `${H_GAP}px`,
      ['--nav-thumb-width' as const]: `${H_THUMB_WIDTH}px`,
      ['--nav-thumb-size' as const]: `${H_THUMB_HEIGHT}px`,
      ['--nav-shell-padding' as const]: `${H_SHELL_PADDING}px`,
      ['--nav-total-width' as const]: `${totalWidth}px`,
      ['--nav-items-width' as const]: `${itemsWidth}px`,
    }),
    [itemsWidth, totalWidth]
  );

  return (
    <div className={[styles.wrapperHorizontal, className].filter(Boolean).join(' ')} style={cssVars}>
      <div className={styles.glow} aria-hidden />
      <div className={styles.shellHorizontal}>
        <div
          className={styles.thumbHorizontal}
          style={{
            transform: `translate(${thumbTranslateX}px, -50%)`,
            ['--thumb-x' as const]: `${thumbTranslateX}px`,
            animation: animKey ? 'thumbLiquidX 720ms cubic-bezier(0.22, 0.88, 0.32, 1.08)' : undefined,
          }}
          aria-hidden
        />

        <div className={styles.itemsHorizontal}>
          {resolvedItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = index === clampedIndex;
            const label = item.label ?? item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={label}
                aria-pressed={isActive}
                onClick={() => onChange?.(index)}
                className={[styles.button, isActive ? styles.buttonActive : null]
                  .filter(Boolean)
                  .join(' ')}
              >
                <Icon strokeWidth={1.6} size={18} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export type { GlassVerticalNavProps };
