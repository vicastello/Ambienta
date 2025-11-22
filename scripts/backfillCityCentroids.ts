import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

type Combo = { cidade: string; uf: string | null };

const LOCAL_DATA = path.join(process.cwd(), 'public', 'data', 'br-city-centroids.json');

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function geocodeCityUF(cidade: string, uf: string | null) {
  const q = `${cidade}${uf ? ', ' + uf : ''}, Brazil`;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'gestor-tiny/1.0 (+https://example.com)' },
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (!Array.isArray(json) || json.length === 0) return null;
  const item = json[0];
  return { lat: Number(item.lat), lon: Number(item.lon) };
}

async function main() {
  try {
    console.log('Buscando combos cidade/uf sem coordenadas...');
    const { data: rows, error } = await supabaseAdmin
      .from('tiny_orders')
      .select('cidade,uf')
      .not('cidade', 'is', null)
      .is('cidade_lat', null)
      .limit(20000);

    if (error) {
      console.error('Erro ao consultar rows:', error.message);
      process.exit(1);
    }

    const combosMap = new Map<string, Combo>();
    for (const r of rows ?? []) {
      const cidade = (r.cidade || '').trim();
      const uf = r.uf ? ('' + r.uf).trim().toUpperCase().slice(0, 2) : null;
      if (!cidade) continue;
      const key = `${cidade.toLowerCase()}|${uf ?? ''}`;
      if (!combosMap.has(key)) combosMap.set(key, { cidade, uf });
    }

    const combos = Array.from(combosMap.values());
    console.log('Combos únicos encontrados:', combos.length);

    // Load local dataset if available
    let localMap: Record<string, { lat: number; lon: number }> | null = null;
    if (fs.existsSync(LOCAL_DATA)) {
      try {
        const j = JSON.parse(fs.readFileSync(LOCAL_DATA, 'utf-8'));
        localMap = j;
        console.log('Dataset local de centróides carregado.');
      } catch (e) {
        console.warn('Falha ao ler dataset local:', e?.message || e);
      }
    }

    for (const combo of combos) {
      const key = `${combo.cidade.toLowerCase()}|${combo.uf ?? ''}`;
      let coords: { lat: number; lon: number } | null = null;

      // try local lookup
      if (localMap) {
        const k1 = `${combo.cidade.toLowerCase()}|${combo.uf ?? ''}`;
        if (localMap[k1]) coords = localMap[k1];
        else if (localMap[combo.cidade.toLowerCase()]) coords = localMap[combo.cidade.toLowerCase()];
      }

      // fallback: geocode using Nominatim
      if (!coords) {
        console.log('Geocodificando:', combo.cidade, combo.uf ?? '');
        const g = await geocodeCityUF(combo.cidade, combo.uf);
        if (g) coords = { lat: g.lat, lon: g.lon };
        // polite delay
        await sleep(1100);
      }

      if (!coords) {
        console.warn('Sem coordenadas para', combo.cidade, combo.uf ?? '');
        continue;
      }

      // update tiny_orders rows matching cidade+uf
      const updates = {
        cidade_lat: coords.lat,
        cidade_lon: coords.lon,
      } as any;

      const matchObj: any = { cidade: combo.cidade };
      if (combo.uf) matchObj.uf = combo.uf;

      const { data: up, error: upErr } = await supabaseAdmin
        .from('tiny_orders')
        .update(updates)
        .match(matchObj);

      if (upErr) {
        console.error('Erro ao atualizar rows para', combo, upErr.message);
      } else {
        console.log('Atualizado', combo.cidade, combo.uf ?? '', '->', coords.lat, coords.lon);
      }
    }

    console.log('Backfill de centróides concluído.');
  } catch (e: any) {
    console.error('Erro inesperado:', e?.message || e);
    process.exit(1);
  }
}

main();
