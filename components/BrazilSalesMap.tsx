"use client";

import React, { useMemo, useState } from "react";
import { createPortal } from 'react-dom';
import { VectorMap } from "@south-paw/react-vector-maps";
// Substitui o JSON local por fonte oficial do mapa
// @svg-maps/brazil exporta { label, viewBox, locations: [{ id, name, path }] }
// Convertido abaixo para o formato esperado pelo VectorMap: { name, viewBox, layers: [{ id, name, d }] }
// Import dinâmico para reduzir risco de SSR/ESM edge-cases
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Brazil from "@svg-maps/brazil";

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
  const [_, fr, fg, fb] = f as unknown as string[];
  const [__, tr, tg, tb] = t2 as unknown as string[];
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
  dataUF: VendasUF[];
  topCidades: VendasCidade[];
  className?: string;
}) {
  const [hoverInfo, setHoverInfo] = useState<{ uf: string; name?: string } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [tooltipTarget, setTooltipTarget] = useState<{ x: number; y: number } | null>(null);
  const tooltipPosRef = React.useRef<{ x: number; y: number } | null>(null);
  const [animatedPos, setAnimatedPos] = useState<{ x: number; y: number } | null>(null);
  // Hover UX control
  const showTimerRef = React.useRef<number | null>(null);
  const hideTimerRef = React.useRef<number | null>(null);
  const lastHoverRef = React.useRef<{ uf: string; name?: string } | null>(null);
  const [selectedUF, setSelectedUF] = useState<string | null>(null);
  const selectedPathRef = React.useRef<SVGElement | null>(null);
  // Constrói o objeto de mapa no formato do VectorMap a partir do pacote @svg-maps/brazil
  const mapData = React.useMemo(() => {
    const src: any = (Brazil as any) || {};
    const locations: any[] = src.locations || src.layers || [];
    const layers = locations
      .map((loc: any) => {
        const rawId = String(loc.id || "");
        // Garante prefixo BR- para compatibilidade com idToUF e seletores CSS
        const id = /^br[-_]/i.test(rawId) ? rawId : `BR-${rawId.toUpperCase()}`;
        const name = loc.name || loc.label || "";
        const d = loc.path || loc.d || "";
        return d ? { id, name, d } : null;
      })
      .filter(Boolean);
    return {
      id: "brazil",
      name: src.label || src.name || "Brazil",
      viewBox: src.viewBox || "0 0 613 639",
      layers,
    } as { id: string; name: string; viewBox: string; layers: Array<{ id: string; name: string; d: string }>; };
  }, []);
  // Map id -> name for quick lookup in event handlers
  const nameById = React.useMemo(() => {
    const m = new Map<string, string>();
    ((mapData as any)?.layers || []).forEach((l: any) => m.set(String(l.id), l.name || ""));
    return m;
  }, [mapData]);

  // Normaliza diferentes assinaturas que bibliotecas de mapas podem chamar os handlers:
  // - (event)
  // - (payload, event)
  // - (event, payload)
  function normalizeLayerEvent(args: any[]) {
    const a0 = args[0];
    const a1 = args[1];
    let id: string | null = null;
    let clientX: number | undefined = undefined;
    let clientY: number | undefined = undefined;
    let pointerType: string | undefined = undefined;
    let currentTarget: EventTarget | null = null;

    // If first argument looks like a DOM Event
    if (a0 && typeof a0 === 'object' && ('currentTarget' in a0 || 'clientX' in a0 || 'nativeEvent' in a0)) {
      const ev: any = a0;
      currentTarget = ev?.currentTarget ?? null;
      id = ev?.currentTarget?.id ?? ev?.target?.id ?? ev?.id ?? null;
      // some map libraries put the layer id on dataset or a custom prop
      if (!id && ev?.target?.dataset) id = ev.target.dataset.id ?? id;
      clientX = ev?.clientX ?? ev?.nativeEvent?.clientX ?? undefined;
      clientY = ev?.clientY ?? ev?.nativeEvent?.clientY ?? undefined;
      pointerType = ev?.pointerType ?? undefined;
      return { id, clientX, clientY, pointerType, currentTarget };
    }

    // If first arg is a payload (map layer) and second is an event
    if (a0 && typeof a0 === 'object') {
      const payload: any = a0;
      id = payload?.id ?? payload?.properties?.id ?? payload?.feature?.id ?? payload?.layerId ?? payload?.properties?.geoId ?? null;
      // some payloads include nested feature properties
      if (!id && payload?.feature?.properties) id = payload.feature.properties.id ?? payload.feature.properties.code ?? null;
    }
    if (a1 && typeof a1 === 'object') {
      const ev: any = a1;
      clientX = ev?.clientX ?? ev?.nativeEvent?.clientX ?? undefined;
      clientY = ev?.clientY ?? ev?.nativeEvent?.clientY ?? undefined;
      pointerType = ev?.pointerType ?? undefined;
    }

    // If id looks like a bare UF (e.g. 'SP'), normalize to `BR-SP` for idToUF
    if (id && /^[A-Za-z]{2}$/.test(String(id))) id = `BR-${String(id).toUpperCase()}`;

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
  React.useEffect(() => {
    return () => {
      if (showTimerRef.current) window.clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);
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
  const effectiveDataUF = dataUF !== undefined && dataUF !== null ? dataUF : (cachedMapa?.mapaVendasUF ?? []);
  const effectiveTopCidades = topCidades !== undefined && topCidades !== null ? topCidades : (cachedMapa?.mapaVendasCidade ?? []);

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
          {...(mapData as any)}
          className="rvm-svg w-full h-full"
          layerProps={{
            // Normalize different handler signatures used by map libraries and browsers
            onPointerEnter: (...args: any[]) => {
              const { id, clientX, clientY, pointerType, currentTarget } = normalizeLayerEvent(args);
              if (pointerType && pointerType !== 'mouse' && pointerType !== 'pen') return;
              const uf = idToUF(id);
              const name = id ? nameById.get(id) : undefined;
              if (uf) {
                lastHoverRef.current = { uf, name };
                let pos = null;
                if (typeof clientX === 'number' && typeof clientY === 'number') {
                  pos = { x: clientX, y: clientY };
                } else if (currentTarget && (currentTarget as Element).getBoundingClientRect) {
                  try {
                    const r = (currentTarget as Element).getBoundingClientRect();
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
            onPointerMove: (...args: any[]) => {
              const { id, clientX, clientY, pointerType, currentTarget } = normalizeLayerEvent(args);
              if (pointerType && pointerType !== 'mouse' && pointerType !== 'pen') return;
              let pos = null;
              if (typeof clientX === 'number' && typeof clientY === 'number') {
                pos = { x: clientX, y: clientY };
              } else if (currentTarget && (currentTarget as Element).getBoundingClientRect) {
                try {
                  const r = (currentTarget as Element).getBoundingClientRect();
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
            onPointerLeave: (...args: any[]) => {
              setHoverInfo(null);
              setTooltipTarget(null);
              setAnimatedPos(null);
            },
            // Mouse fallback for older browsers and libraries which call mouse handlers
            onMouseEnter: (...args: any[]) => {
              const { id, clientX, clientY, currentTarget } = normalizeLayerEvent(args);
              const uf = idToUF(id);
              const name = id ? nameById.get(id) : undefined;
              if (uf) {
                lastHoverRef.current = { uf, name };
                // If coordinates are not provided, compute element center as fallback
                if (typeof clientX !== 'number' || typeof clientY !== 'number') {
                  try {
                    const el = id ? document.getElementById(id) : null;
                    if (el && typeof (el as HTMLElement).getBoundingClientRect === 'function') {
                      const r = (el as HTMLElement).getBoundingClientRect();
                      const cx = r.left + r.width / 2;
                      const cy = r.top + r.height / 2;
                      setTooltipTarget({ x: cx, y: cy });
                      tooltipPosRef.current = { x: cx, y: cy };
                      setAnimatedPos({ x: cx, y: cy });
                    }
                  } catch (err) {
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
            onMouseMove: (...args: any[]) => {
              const { clientX, clientY } = normalizeLayerEvent(args);
              // diagnostics removed
              if (typeof clientX === 'number' && typeof clientY === 'number') setTooltipTarget({ x: clientX, y: clientY });
            },
            onMouseLeave: () => {
              setHoverInfo(null);
              setTooltipTarget(null);
              setAnimatedPos(null);
            },
            onFocus: (...args: any[]) => {
              const { id } = normalizeLayerEvent(args);
              const uf = idToUF(id);
              const name = id ? nameById.get(id) : undefined;
              if (uf) setHoverInfo({ uf, name });
            },
            onBlur: () => {
              setHoverInfo(null);
            },
            onClick: (...args: any[]) => {
              const { id, clientX, clientY } = normalizeLayerEvent(args);
              const el = id ? document.getElementById(id) : null;
              const uf = idToUF(id);
              const prevId = selectedPathRef.current?.id || null;
              // toggle selection by id to avoid cross-type ref issues
              if (prevId && id && prevId === id) {
                const prevEl = document.getElementById(prevId) as HTMLElement | null;
                if (prevEl) prevEl.removeAttribute('aria-selected');
                selectedPathRef.current = null;
                setSelectedUF(null);
              } else {
                if (prevId) {
                  const prevEl = document.getElementById(prevId) as HTMLElement | null;
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
                    const r = (el as HTMLElement).getBoundingClientRect();
                    setTooltipTarget({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
                  } catch {}
                }
                if (showTimerRef.current) window.clearTimeout(showTimerRef.current);
                showTimerRef.current = window.setTimeout(() => {
                  if (lastHoverRef.current) setHoverInfo(lastHoverRef.current);
                }, 40);
              }
            },
            onKeyDown: (e: any) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const el = e.currentTarget as HTMLElement | null;
                const id = el?.id || null;
                const uf = idToUF(id);
                const prevId = selectedPathRef.current?.id || null;
                if (prevId && id && prevId === id) {
                  const prevEl = document.getElementById(prevId) as HTMLElement | null;
                  if (prevEl) prevEl.removeAttribute('aria-selected');
                  selectedPathRef.current = null;
                  setSelectedUF(null);
                } else {
                  if (prevId) {
                    const prevEl = document.getElementById(prevId) as HTMLElement | null;
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
          ${(((mapData as any)?.layers) || [])
            .map((layer: any) => {
              const rawId = String(layer.id);
              const idLower = rawId.toLowerCase();
              const idUpper = rawId.toUpperCase();
              // Also consider BR-SP vs br-sp vs br_sp
              const idUnderscore = idLower.replace(/-/g, '_');
              const uf = idToUF(layer.id);
              const d = uf ? mapaUF.get(uf) : null;
              const val = d?.totalValor || 0;
              const fill = colorScale(val);
              // Emit selectors for common ID variants to maximize compatibility
              return [
                `.rvm-svg #${idLower} { fill: ${val > 0 ? fill : "#eef8fa"} !important; fill-opacity: 1; }`,
                `.rvm-svg #${idUpper} { fill: ${val > 0 ? fill : "#eef8fa"} !important; fill-opacity: 1; }`,
                `.rvm-svg #${idUnderscore} { fill: ${val > 0 ? fill : "#eef8fa"} !important; fill-opacity: 1; }`,
              ].join('\n');
            })
            .join("\n")}
        `}</style>

        {/* Extra SVG selection/hover styles for glassy highlight (borderless) */}
        <style jsx global>{`
          .rvm-svg path { transition: fill 0.18s ease, filter 0.14s ease, transform 0.12s ease; stroke: none !important; pointer-events: auto !important; }
          .rvm-svg, .rvm-svg svg { pointer-events: auto !important; }
          .rvm-svg { position: relative; }
          .rvm-svg path:hover { filter: drop-shadow(0 12px 30px rgba(0,110,118,0.12)); transform: translateY(-2px) scale(1.01); }
          .rvm-svg path[aria-selected="true"] { filter: drop-shadow(0 18px 44px rgba(0,110,118,0.16)); transform: translateY(-4px) scale(1.02); }
          .rvm-svg path[aria-selected="true"] ~ g, .rvm-svg path[aria-selected="true"] { outline: none; }
        `}</style>
        {/* Tooltip rendered into document.body via portal so it's not affected by ancestor transforms/stacking contexts */}
        {typeof document !== 'undefined' && hoverInfo && animatedPos && (() => {
          const left = typeof window !== 'undefined' ? Math.max(8, Math.min(animatedPos.x + 16, window.innerWidth - 260)) : (animatedPos.x + 16);
          const top = typeof window !== 'undefined' ? Math.max(8, Math.min(animatedPos.y + 16, window.innerHeight - 120)) : (animatedPos.y + 16);
          const tooltipStyle: any = { position: 'fixed', zIndex: 11000, pointerEvents: 'none', left, top, transition: 'left 0.08s linear, top 0.08s linear' };
          return createPortal(
            <div style={tooltipStyle}>
            <div className="rounded-md px-3 py-2 text-xs shadow-lg" style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0.28))',
              // no solid border around the tooltip itself to keep glassy feel
              border: '1px solid rgba(255,255,255,0.06)',
              backdropFilter: 'blur(8px) saturate(110%)',
              WebkitBackdropFilter: 'blur(8px) saturate(110%)',
              boxShadow: '0 8px 30px rgba(8,15,22,0.08)'
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
            WebkitBackdropFilter: 'blur(10px) saturate(120%)',
            boxShadow: '0 12px 40px rgba(7,18,26,0.12)'
          }}>
            <div className="flex items-center justify-between">
              <div className="font-semibold text-slate-900 dark:text-white">{selectedUF}</div>
              <button onClick={() => {
                if (selectedPathRef.current) {
                  const el = document.getElementById(selectedPathRef.current.id) as HTMLElement | null;
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
      {/* Legend */}
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <span>Menos</span>
        <div className="h-2 flex-1 rounded-full" style={{
          background: `linear-gradient(90deg, #e0f7fa, #38c5cf, #009DA8, #006E76)`,
        }} />
        <span>Mais</span>
      </div>
      {/* Removido: a lista de cidades não é mais exibida aqui. As cidades aparecem somente no mapa. */}
    </div>
  );
}
