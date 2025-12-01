"use client";

import React, { useMemo, useState, type CSSProperties } from "react";
import { createPortal } from 'react-dom';
import { VectorMap } from "@south-paw/react-vector-maps";
// Substitui o JSON local por fonte oficial do mapa
// @svg-maps/brazil exporta { label, viewBox, locations: [{ id, name, path }] }
// Convertido abaixo para o formato esperado pelo VectorMap: { name, viewBox, layers: [{ id, name, d }] }
// Import dinâmico para reduzir risco de SSR/ESM edge-cases
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Brazil from "@svg-maps/brazil";

type TooltipPoint = { x: number; y: number };

type BrazilSvgLayer = {
  id?: string | number;
  name?: string;
  label?: string;
  path?: string;
  d?: string;
};

type BrazilSvgSource = {
  label?: string;
  name?: string;
  viewBox?: string;
  locations?: BrazilSvgLayer[];
  layers?: BrazilSvgLayer[];
};

type BrazilMapLayer = {
  id: string;
  name: string;
  d: string;
};

type BrazilMapData = {
  id: string;
  name: string;
  viewBox: string;
  layers: BrazilMapLayer[];
};

type PointerEventLike = {
  currentTarget?: EventTarget | null;
  target?: EventTarget | null;
  clientX?: number;
  clientY?: number;
  nativeEvent?: { clientX?: number; clientY?: number } | null;
  pointerType?: string;
};

type LayerPayload = {
  id?: string;
  properties?: { id?: string; code?: string; geoId?: string };
  feature?: { id?: string; properties?: { id?: string; code?: string } };
  layerId?: string;
};

type NormalizedLayerEvent = {
  id: string | null;
  clientX?: number;
  clientY?: number;
  pointerType?: string;
  currentTarget: EventTarget | null;
};

const isPointerEventLike = (value: unknown): value is PointerEventLike =>
  typeof value === 'object' && value !== null && (
    'currentTarget' in value || 'clientX' in value || 'nativeEvent' in value
  );

const isLayerPayload = (value: unknown): value is LayerPayload => typeof value === 'object' && value !== null;

const extractIdFromTarget = (target: EventTarget | null | undefined): string | null => {
  if (!target) return null;
  const candidate = target as { id?: unknown; dataset?: DOMStringMap };
  if (typeof candidate.id === 'string' && candidate.id.trim()) return candidate.id;
  const datasetId = candidate.dataset?.id;
  return typeof datasetId === 'string' && datasetId.trim() ? datasetId : null;
};

const extractIdFromPayload = (payload?: LayerPayload | null): string | null => {
  if (!payload) return null;
  return (
    payload.id ??
    payload.layerId ??
    payload.properties?.id ??
    payload.properties?.code ??
    payload.properties?.geoId ??
    payload.feature?.id ??
    payload.feature?.properties?.id ??
    payload.feature?.properties?.code ??
    null
  );
};

export type VendasUF = {
  uf: string; // ex: 'SP'
  totalValor: number;
  totalPedidos: number;
};

export type VendasCidade = {
  cidade: string;
  uf: string | null;
  totalValor: number;
  totalPedidos: number;
};

function interpolateColor(from: string, to: string, t: number) {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const tt = clamp(t);
  const f = from.match(/#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
  const t2 = to.match(/#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
  if (!f || !t2) return from;
  const [, fr, fg, fb] = f as unknown as string[];
  const [, tr, tg, tb] = t2 as unknown as string[];
  const ir = Math.round(parseInt(fr, 16) + (parseInt(tr, 16) - parseInt(fr, 16)) * tt);
  const ig = Math.round(parseInt(fg, 16) + (parseInt(tg, 16) - parseInt(fg, 16)) * tt);
  const ib = Math.round(parseInt(fb, 16) + (parseInt(tb, 16) - parseInt(fb, 16)) * tt);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(ir)}${toHex(ig)}${toHex(ib)}`;
}

function idToUF(id?: string | null): string | null {
  if (!id) return null;
  // Aceita tanto 'BR-SP' quanto 'br-sp' ou 'br_sp'
  const m = String(id).match(/^[Bb][Rr][-_]?([A-Za-z]{2})$/);
  return m ? m[1].toUpperCase() : null;
}

export function BrazilSalesMap({
  dataUF,
  topCidades,
  className,
}: {
  dataUF?: VendasUF[] | null;
  topCidades?: VendasCidade[] | null;
  className?: string;
}) {
  const [hoverInfo, setHoverInfo] = useState<{ uf: string; name?: string } | null>(null);
  const [tooltipTarget, setTooltipTarget] = useState<TooltipPoint | null>(null);
  const tooltipPosRef = React.useRef<TooltipPoint | null>(null);
  const [animatedPos, setAnimatedPos] = useState<TooltipPoint | null>(null);
  // Hover UX control
  const showTimerRef = React.useRef<number | null>(null);
  const hideTimerRef = React.useRef<number | null>(null);
  const lastHoverRef = React.useRef<{ uf: string; name?: string } | null>(null);
  const [selectedUF, setSelectedUF] = useState<string | null>(null);
  const selectedPathRef = React.useRef<SVGElement | null>(null);
  const clearHoverTimers = React.useCallback(() => {
    const pendingShow = showTimerRef.current;
    const pendingHide = hideTimerRef.current;
    if (pendingShow) window.clearTimeout(pendingShow);
    if (pendingHide) window.clearTimeout(pendingHide);
  }, []);
  // Constrói o objeto de mapa no formato do VectorMap a partir do pacote @svg-maps/brazil
  const mapData = React.useMemo<BrazilMapData>(() => {
    const src = (Brazil as BrazilSvgSource) ?? {};
    const rawLayers = Array.isArray(src.locations) && src.locations.length ? src.locations : src.layers ?? [];
    const layers: BrazilMapLayer[] = rawLayers
      .map((loc): BrazilMapLayer | null => {
        if (!loc) return null;
        const rawId = String(loc.id ?? "");
        const normalizedId = /^br[-_]/i.test(rawId) ? rawId : `BR-${rawId.toUpperCase()}`;
        const name = loc.name || loc.label || "";
        const d = loc.path || loc.d || "";
        return d ? { id: normalizedId, name, d } : null;
      })
      .filter((layer): layer is BrazilMapLayer => Boolean(layer));
    return {
      id: "brazil",
      name: src.label || src.name || "Brazil",
      viewBox: src.viewBox || "0 0 613 639",
      layers,
    };
  }, []);
  // Map id -> name for quick lookup in event handlers
  const nameById = React.useMemo(() => {
    const lookup = new Map<string, string>();
    mapData.layers.forEach((layer) => lookup.set(layer.id, layer.name));
    return lookup;
  }, [mapData]);

  // Normaliza diferentes assinaturas que bibliotecas de mapas podem chamar os handlers:
  // - (event)
  // - (payload, event)
  // - (event, payload)
  function normalizeLayerEvent(args: unknown[]): NormalizedLayerEvent {
    const [first, second] = args;
    let id: string | null = null;
    let clientX: number | undefined;
    let clientY: number | undefined;
    let pointerType: string | undefined;
    let currentTarget: EventTarget | null = null;

    if (isPointerEventLike(first)) {
      currentTarget = first.currentTarget ?? null;
      id = extractIdFromTarget(first.currentTarget) ?? extractIdFromTarget(first.target) ?? null;
      clientX = first.clientX ?? first.nativeEvent?.clientX ?? undefined;
      clientY = first.clientY ?? first.nativeEvent?.clientY ?? undefined;
      pointerType = first.pointerType ?? undefined;
      return { id, clientX, clientY, pointerType, currentTarget };
    }

    if (isLayerPayload(first)) {
      id = extractIdFromPayload(first);
    }
    if (isPointerEventLike(second)) {
      clientX = second.clientX ?? second.nativeEvent?.clientX ?? undefined;
      clientY = second.clientY ?? second.nativeEvent?.clientY ?? undefined;
      pointerType = second.pointerType ?? undefined;
      currentTarget = second.currentTarget ?? null;
      if (!id) id = extractIdFromTarget(second.currentTarget) ?? extractIdFromTarget(second.target) ?? null;
    }

    if (id && /^[A-Za-z]{2}$/.test(id)) {
      id = `BR-${id.toUpperCase()}`;
    }

    return { id, clientX, clientY, pointerType, currentTarget };
  }

  // Smooth tooltip follow using requestAnimationFrame (lerp)
  React.useEffect(() => {
    let raf = 0;
    const step = () => {
      const target = tooltipTarget;
      const current = tooltipPosRef.current;
      if (!target) {
        // fade out: move current slightly toward null by clearing if close
        if (current) {
          // when no target, quickly clear
          tooltipPosRef.current = null;
          setAnimatedPos(null);
        }
        return;
      }
      if (!current) {
        tooltipPosRef.current = { x: target.x, y: target.y };
        setAnimatedPos({ x: target.x, y: target.y });
      } else {
        const nx = current.x + (target.x - current.x) * 0.18;
        const ny = current.y + (target.y - current.y) * 0.18;
        tooltipPosRef.current = { x: nx, y: ny };
        setAnimatedPos({ x: nx, y: ny });
      }
      raf = requestAnimationFrame(step);
    };
    if (tooltipTarget) raf = requestAnimationFrame(step);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [tooltipTarget]);

  // Clear pending hover timers on unmount
  React.useEffect(() => clearHoverTimers, [clearHoverTimers]);
  const [cachedMapa, setCachedMapa] = useState<{
    mapaVendasUF?: VendasUF[];
    mapaVendasCidade?: VendasCidade[];
  } | null>(null);

  React.useEffect(() => {
    let alive = true;
    // Tenta carregar dados pré-computados (opcional)
    fetch('/data/mapa-vendas.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (alive && json) {
          setCachedMapa({
            mapaVendasUF: json.mapaVendasUF,
            mapaVendasCidade: json.mapaVendasCidade,
          });
        }
      })
      .catch(() => {
        /* sem problemas se não existir */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Prefer data passed by the page (which will reflect filters) and only
  // fallback to a cached /data/mapa-vendas.json when no prop is provided.
  const effectiveDataUF = useMemo(() => dataUF ?? cachedMapa?.mapaVendasUF ?? [], [dataUF, cachedMapa]);
  const effectiveTopCidades = useMemo(() => topCidades ?? cachedMapa?.mapaVendasCidade ?? [], [topCidades, cachedMapa]);

  const mapaUF = useMemo(() => {
    const map = new Map<string, VendasUF>();
    for (const d of effectiveDataUF || []) map.set(d.uf.toUpperCase(), d);
    return map;
  }, [effectiveDataUF]);

  const maxValor = useMemo(() => {
    const arr = effectiveDataUF || [];
    return arr.reduce((m, d) => Math.max(m, d.totalValor || 0), 0) || 1;
  }, [effectiveDataUF]);

  const colorScale = (v: number) => {
    const t = Math.max(0, Math.min(1, v / maxValor));
    // make small values more visible by using a gentler exponent and stronger light color
    const baseLight = "#89e1e6"; // stronger light teal
    const baseDark = "#006E76"; // Ambienta dark
    // ease-in less so low values show more color (smaller exponent -> more visible low values)
    const eased = Math.pow(t, 0.3);
    return interpolateColor(baseLight, baseDark, eased);
  };

  return (
    <div className={className}>
      <div className="relative w-full bg-white/0" style={{ aspectRatio: "4/3" }}>
        <VectorMap
          {...mapData}
          className="rvm-svg w-full h-full"
          layerProps={{
            // Normalize different handler signatures used by map libraries and browsers
            onPointerEnter: (...args: unknown[]) => {
              const { id, clientX, clientY, pointerType, currentTarget } = normalizeLayerEvent(args);
              if (pointerType && pointerType !== 'mouse' && pointerType !== 'pen') return;
              const uf = idToUF(id);
              const name = id ? nameById.get(id) : undefined;
              if (uf) {
                lastHoverRef.current = { uf, name };
                let pos = null;
                if (typeof clientX === 'number' && typeof clientY === 'number') {
                  pos = { x: clientX, y: clientY };
                } else if (currentTarget instanceof Element) {
                  try {
                    const r = currentTarget.getBoundingClientRect();
                    pos = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                  } catch {}
                }
                if (pos) {
                  setTooltipTarget(pos);
                  tooltipPosRef.current = pos;
                  setAnimatedPos(pos);
                }
                setHoverInfo({ uf, name });
              }
            },
            onPointerMove: (...args: unknown[]) => {
              const { id, clientX, clientY, pointerType, currentTarget } = normalizeLayerEvent(args);
              if (pointerType && pointerType !== 'mouse' && pointerType !== 'pen') return;
              let pos = null;
              if (typeof clientX === 'number' && typeof clientY === 'number') {
                pos = { x: clientX, y: clientY };
              } else if (currentTarget instanceof Element) {
                try {
                  const r = currentTarget.getBoundingClientRect();
                  pos = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                } catch {}
              }
              if (pos) {
                setTooltipTarget(pos);
                tooltipPosRef.current = pos;
                setAnimatedPos(pos);
              }
              const uf = idToUF(id);
              const name = id ? nameById.get(id) : undefined;
              if (uf) {
                lastHoverRef.current = { uf, name };
                setHoverInfo({ uf, name });
              }
            },
            onPointerLeave: () => {
              setHoverInfo(null);
              setTooltipTarget(null);
              setAnimatedPos(null);
            },
            // Mouse fallback for older browsers and libraries which call mouse handlers
            onMouseEnter: (...args: unknown[]) => {
              const { id, clientX, clientY } = normalizeLayerEvent(args);
              const uf = idToUF(id);
              const name = id ? nameById.get(id) : undefined;
              if (uf) {
                lastHoverRef.current = { uf, name };
                // If coordinates are not provided, compute element center as fallback
                if (typeof clientX !== 'number' || typeof clientY !== 'number') {
                  try {
                    const el = id ? document.getElementById(id) : null;
                    if (el) {
                      const r = el.getBoundingClientRect();
                      const cx = r.left + r.width / 2;
                      const cy = r.top + r.height / 2;
                      setTooltipTarget({ x: cx, y: cy });
                      tooltipPosRef.current = { x: cx, y: cy };
                      setAnimatedPos({ x: cx, y: cy });
                    }
                  } catch {
                    // ignore
                  }
                } else {
                  setTooltipTarget({ x: clientX, y: clientY });
                  tooltipPosRef.current = { x: clientX, y: clientY };
                  setAnimatedPos({ x: clientX, y: clientY });
                }
                if (!hoverInfo) setHoverInfo({ uf, name });
              }
            },
            onMouseMove: (...args: unknown[]) => {
              const { clientX, clientY } = normalizeLayerEvent(args);
              // diagnostics removed
              if (typeof clientX === 'number' && typeof clientY === 'number') setTooltipTarget({ x: clientX, y: clientY });
            },
            onMouseLeave: () => {
              setHoverInfo(null);
              setTooltipTarget(null);
              setAnimatedPos(null);
            },
            onFocus: (...args: unknown[]) => {
              const { id } = normalizeLayerEvent(args);
              const uf = idToUF(id);
              const name = id ? nameById.get(id) : undefined;
              if (uf) setHoverInfo({ uf, name });
            },
            onBlur: () => {
              setHoverInfo(null);
            },
            onClick: (...args: unknown[]) => {
              const { id, clientX, clientY } = normalizeLayerEvent(args);
              const el = id ? document.getElementById(id) : null;
              const uf = idToUF(id);
              const prevId = selectedPathRef.current?.id || null;
              // toggle selection by id to avoid cross-type ref issues
              if (prevId && id && prevId === id) {
                const prevEl = document.getElementById(prevId);
                if (prevEl) prevEl.removeAttribute('aria-selected');
                selectedPathRef.current = null;
                setSelectedUF(null);
              } else {
                if (prevId) {
                  const prevEl = document.getElementById(prevId);
                  if (prevEl) prevEl.removeAttribute('aria-selected');
                }
                if (el && uf) {
                  el.setAttribute('aria-selected', 'true');
                  selectedPathRef.current = el as unknown as SVGElement;
                  setSelectedUF(uf);
                }
              }
              // Treat clicks/taps as hover for touch devices: show tooltip near the click
              if (uf) {
                lastHoverRef.current = { uf, name: id ? nameById.get(id) : undefined };
                if (typeof clientX === 'number' && typeof clientY === 'number') {
                  setTooltipTarget({ x: clientX, y: clientY });
                } else if (el) {
                  try {
                    const r = el.getBoundingClientRect();
                    setTooltipTarget({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
                  } catch {}
                }
                if (showTimerRef.current) window.clearTimeout(showTimerRef.current);
                showTimerRef.current = window.setTimeout(() => {
                  if (lastHoverRef.current) setHoverInfo(lastHoverRef.current);
                }, 40);
              }
            },
            onKeyDown: (event: React.KeyboardEvent<SVGElement>) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                const el = event.currentTarget as SVGElement | null;
                const id = el?.id || null;
                const uf = idToUF(id);
                const prevId = selectedPathRef.current?.id || null;
                if (prevId && id && prevId === id) {
                  const prevEl = document.getElementById(prevId);
                  if (prevEl) prevEl.removeAttribute('aria-selected');
                  selectedPathRef.current = null;
                  setSelectedUF(null);
                } else {
                  if (prevId) {
                    const prevEl = document.getElementById(prevId);
                    if (prevEl) prevEl.removeAttribute('aria-selected');
                  }
                  if (el && uf) {
                    el.setAttribute('aria-selected', 'true');
                    selectedPathRef.current = el as unknown as SVGElement;
                    setSelectedUF(uf);
                  }
                }
              }
            },
            style: {
              // remove strokes/borders for a clean, borderless map
              stroke: 'none',
              outline: 'none',
              transition: 'fill 0.18s ease, transform 0.12s ease, filter 0.12s ease',
              cursor: 'pointer',
            },
            tabIndex: 0,
            role: 'button',
          }}
          checkedLayers={[]}
          currentLayers={[]}
          tabIndex={-1}
        />
        {/* Overlay colors by UF using CSS fills (generate selectors for multiple casing variants) */}
        <style jsx global>{`
          .rvm-svg path { transition: fill 0.15s ease; }
          ${mapData.layers
            .map((layer) => {
              const rawId = String(layer.id);
              const idLower = rawId.toLowerCase();
              const idUpper = rawId.toUpperCase();
              // Also consider BR-SP vs br-sp vs br_sp
              const idUnderscore = idLower.replace(/-/g, '_');
              const uf = idToUF(layer.id);
              const d = uf ? mapaUF.get(uf) : null;
              const val = d?.totalValor || 0;
              const fill = colorScale(val);
              const emptyFill = '#e5e7eb';
              // Emit selectors for common ID variants to maximize compatibility
              return [
                `.rvm-svg #${idLower} { fill: ${val > 0 ? fill : emptyFill} !important; fill-opacity: 1; }`,
                `.rvm-svg #${idUpper} { fill: ${val > 0 ? fill : emptyFill} !important; fill-opacity: 1; }`,
                `.rvm-svg #${idUnderscore} { fill: ${val > 0 ? fill : emptyFill} !important; fill-opacity: 1; }`,
              ].join('\n');
            })
            .join("\n")}
        `}</style>

        {/* Extra SVG selection/hover styles for glassy highlight (borderless) */}
        <style jsx global>{`
          .rvm-svg path { transition: fill 0.18s ease, transform 0.12s ease; stroke: none !important; pointer-events: auto !important; }
          .rvm-svg, .rvm-svg svg { pointer-events: auto !important; }
          .rvm-svg { position: relative; }
          .rvm-svg path:hover { transform: translateY(-2px) scale(1.01); }
          .rvm-svg path[aria-selected="true"] { transform: translateY(-4px) scale(1.02); }
          .rvm-svg path[aria-selected="true"] ~ g, .rvm-svg path[aria-selected="true"] { outline: none; }
        `}</style>
        {/* Tooltip rendered into document.body via portal so it's not affected by ancestor transforms/stacking contexts */}
        {typeof document !== 'undefined' && hoverInfo && animatedPos && (() => {
          const left = typeof window !== 'undefined' ? Math.max(8, Math.min(animatedPos.x + 16, window.innerWidth - 260)) : (animatedPos.x + 16);
          const top = typeof window !== 'undefined' ? Math.max(8, Math.min(animatedPos.y + 16, window.innerHeight - 120)) : (animatedPos.y + 16);
          const tooltipStyle: CSSProperties = { position: 'fixed', zIndex: 11000, pointerEvents: 'none', left, top, transition: 'left 0.08s linear, top 0.08s linear' };
          return createPortal(
            <div style={tooltipStyle}>
            <div className="rounded-md px-3 py-2 text-xs" style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0.28))',
              // no solid border around the tooltip itself to keep glassy feel
              border: '1px solid rgba(255,255,255,0.06)',
              backdropFilter: 'blur(8px) saturate(110%)',
              WebkitBackdropFilter: 'blur(8px) saturate(110%)',
            }}>
              <div className="font-semibold text-slate-900 dark:text-white">{hoverInfo.name || hoverInfo.uf}</div>
              <div className="text-slate-600 dark:text-slate-300">
                {(() => {
                  const d = mapaUF.get(hoverInfo.uf);
                  if (!d) return 'Sem vendas';
                  const valor = (d.totalValor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                  const pedidos = (d.totalPedidos || 0).toLocaleString('pt-BR');
                  return `${valor} • ${pedidos} pedidos`;
                })()}
              </div>
            </div>
            </div>, document.body
          );
        })()}

        {/* Selected UF side panel */}
        {selectedUF && (
          <div className="absolute top-4 right-4 z-50 w-76 rounded-2xl p-3 text-sm" style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0.22))',
            border: '1px solid rgba(255,255,255,0.12)',
            backdropFilter: 'blur(10px) saturate(120%)',
            WebkitBackdropFilter: 'blur(10px) saturate(120%)'
          }}>
            <div className="flex items-center justify-between">
              <div className="font-semibold text-slate-900 dark:text-white">{selectedUF}</div>
              <button onClick={() => {
                if (selectedPathRef.current) {
                  const el = document.getElementById(selectedPathRef.current.id);
                  if (el) el.removeAttribute('aria-selected');
                }
                selectedPathRef.current = null;
                setSelectedUF(null);
              }} className="text-xs text-slate-600 dark:text-slate-300">Fechar</button>
            </div>
            <div className="mt-2 text-slate-700 dark:text-slate-200 text-xs">
              {(() => {
                const d = mapaUF.get(selectedUF);
                if (!d) return 'Sem dados para este estado.';
                return `${(d.totalValor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} • ${(d.totalPedidos || 0).toLocaleString('pt-BR')} pedidos`;
              })()}
            </div>
            <div className="mt-3">
              <div className="font-medium text-[12px]">Cidades (top)</div>
              <div className="mt-2 max-h-40 overflow-auto">
                {effectiveTopCidades.filter(c => (c.uf || '').toUpperCase() === selectedUF).slice(0, 10).map((c, idx) => (
                  <div key={idx} className="flex justify-between text-[13px] py-1 border-b last:border-b-0">
                    <div className="text-slate-800 dark:text-slate-100">{c.cidade}</div>
                    <div className="text-slate-600 dark:text-slate-300">{(c.totalValor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
