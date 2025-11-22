"use client";

import React, { useMemo, useState } from "react";
import { VectorMap } from "@south-paw/react-vector-maps";

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
  const m = String(id).match(/^BR-([A-Z]{2})$/i);
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
  const [mapData, setMapData] = useState<any | null>(null);
  const [cachedMapa, setCachedMapa] = useState<{
    mapaVendasUF?: VendasUF[];
    mapaVendasCidade?: VendasCidade[];
  } | null>(null);

  React.useEffect(() => {
    let alive = true;
    const mapUrl = "https://react-vector-maps.netlify.app/maps/brazil.json";
    fetch(mapUrl)
      .then((r) => r.json())
      .then((json) => {
        if (alive) setMapData(json);
      })
      .catch(() => setMapData(null));

    // Try to load precomputed mapa vendas from public/data
    fetch('/data/mapa-vendas.json')
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (alive && json) {
          setCachedMapa({ mapaVendasUF: json.mapaVendasUF, mapaVendasCidade: json.mapaVendasCidade });
        }
      })
      .catch(() => {/* ignore */});
    return () => {
      alive = false;
    };
  }, []);

  const effectiveDataUF = cachedMapa?.mapaVendasUF && cachedMapa.mapaVendasUF.length ? cachedMapa.mapaVendasUF : dataUF;
  const effectiveTopCidades = cachedMapa?.mapaVendasCidade && cachedMapa.mapaVendasCidade.length ? cachedMapa.mapaVendasCidade : topCidades;

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
    const baseLight = "#e0f7fa"; // light teal
    const baseDark = "#006E76"; // Ambienta dark
    // ease-in a bit
    const eased = Math.pow(t, 0.7);
    return interpolateColor(baseLight, baseDark, eased);
  };

  return (
    <div className={className}>
      <div className="relative w-full" style={{ aspectRatio: "4/3" }}>
        {mapData ? (
          <VectorMap
            {...(mapData as any)}
            boxClassName="w-full h-full"
            layerProps={{
              onMouseEnter: ({ id, name }: any) => {
                const uf = idToUF(id);
                if (uf) setHoverInfo({ uf, name });
              },
              onMouseLeave: () => setHoverInfo(null),
              style: {
                fill: "#e6f7f9",
                stroke: "#94a3b8",
                strokeWidth: 0.6,
                outline: "none",
                transition: "fill 0.2s ease",
              },
            }}
            checkedLayers={[]}
            currentLayers={[]}
            tabIndex={-1}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">Carregando mapa…</div>
        )}
        {/* Overlay colors by UF using CSS fills */}
        <style jsx global>{`
          .rvm-svg path { transition: fill 0.15s ease; }
          ${(((mapData as any)?.layers) || [])
            .map((layer: any) => {
              const uf = idToUF(layer.id);
              const d = uf ? mapaUF.get(uf) : null;
              const val = d?.totalValor || 0;
              const fill = colorScale(val);
              return `.rvm-svg #${layer.id} { fill: ${val > 0 ? fill : "#eef8fa"} }`;
            })
            .join("\n")}
        `}</style>
        {hoverInfo && (
          <div className="absolute bottom-2 left-2 rounded-xl border border-white/70 bg-white/90 backdrop-blur px-3 py-2 text-xs shadow">
            <div className="font-semibold text-slate-800">{hoverInfo.name || hoverInfo.uf}</div>
            <div className="text-slate-600">
              {(() => {
                const d = mapaUF.get(hoverInfo.uf);
                if (!d) return "Sem vendas";
                const valor = (d.totalValor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                const pedidos = (d.totalPedidos || 0).toLocaleString("pt-BR");
                return `${valor} • ${pedidos} pedidos`;
              })()}
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
      {/* Top cities list (if provided) */}
      {effectiveTopCidades && effectiveTopCidades.length > 0 && (
        <div className="mt-3 text-xs text-slate-600">
          <div className="font-medium mb-1">Top cidades</div>
          <ul className="max-h-40 overflow-auto">
            {effectiveTopCidades.slice(0, 8).map((c, i) => (
              <li key={i} className="flex justify-between">
                <span>{c.cidade} {c.uf ? `(${c.uf})` : ''}</span>
                <span className="text-right">{(c.totalValor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
