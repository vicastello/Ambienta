'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Loader2, RefreshCcw, Save, FileDown } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getErrorMessage } from '@/lib/errors';

type Sugestao = {
  id_produto_tiny: number;
  codigo: string | null;
  nome: string | null;
  gtin: string | null;
  fornecedor_codigo: string | null;
  embalagem_qtd: number;
  saldo: number;
  reservado: number;
  disponivel: number;
  consumo_periodo: number;
  consumo_mensal: number;
  sugestao_base: number;
  sugestao_ajustada: number;
  alerta_embalagem: boolean;
};

export default function ComprasPage() {
  const [periodDays, setPeriodDays] = useState(60);
  const [targetMonths, setTargetMonths] = useState(2);
  const [dados, setDados] = useState<Sugestao[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [observacoes, setObservacoes] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(
        `/api/compras/sugestoes?periodDays=${periodDays}&targetMonths=${targetMonths}`,
        { cache: 'no-store' }
      );
      if (!res.ok) throw new Error('Erro ao carregar sugestões');
      const json = await res.json();
      setDados(json.produtos || []);
    } catch (error: unknown) {
      setErro(getErrorMessage(error) ?? 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }, [periodDays, targetMonths]);

  useEffect(() => {
    void load();
  }, [load]);

  const salvarProduto = async (id: number, fornecedor: string | null, embalagem: number) => {
    setSavingId(id);
    try {
      const res = await fetch('/api/compras/produto', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_produto_tiny: id,
          fornecedor_codigo: fornecedor || null,
          embalagem_qtd: embalagem || null,
        }),
      });
      if (!res.ok) throw new Error('Erro ao salvar');
    } catch (error: unknown) {
      alert(getErrorMessage(error) ?? 'Erro ao salvar produto');
    } finally {
      setSavingId(null);
    }
  };

  const derivados = useMemo(() => {
    return dados.map((p) => {
      const pack = Math.max(p.embalagem_qtd || 1, 1);
      const sugestaoAjustada = p.sugestao_base > 0 ? Math.ceil(p.sugestao_base / pack) * pack : 0;
      const alerta = p.sugestao_base > 0 && p.sugestao_base < pack;
      return { ...p, embalagem_qtd: pack, sugestao_ajustada: sugestaoAjustada, alerta_embalagem: alerta };
    });
  }, [dados]);

  const totalCompra = useMemo(
    () => derivados.reduce((acc, cur) => acc + (cur.sugestao_ajustada || 0), 0),
    [derivados]
  );

  const gerarPdf = async () => {
    const doc = new jsPDF();
    try {
      const logoResp = await fetch('/favicon.png');
      const blob = await logoResp.blob();
      const reader = new FileReader();
      const dataUrl: string = await new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      doc.addImage(dataUrl, 'PNG', 12, 12, 14, 14);
    } catch {
      // prossegue sem logo
    }

    doc.setFontSize(14);
    doc.text('Sugestão de Compras - Ambienta', 30, 20);
    doc.setFontSize(9);
    doc.text(`Período: últimos ${periodDays} dias · Cobertura: ${targetMonths} meses`, 30, 26);

    const rows = derivados.map((p) => [
      p.fornecedor_codigo || '-',
      p.gtin || '-',
      p.nome || '',
      p.sugestao_ajustada.toLocaleString('pt-BR'),
      (observacoes[p.id_produto_tiny] || '').slice(0, 120),
    ]);

    autoTable(doc, {
      head: [['Código Fornecedor', 'EAN', 'Produto', 'Qtd Pedido', 'Observações']],
      body: rows,
      startY: 32,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [0, 157, 168] },
      theme: 'grid',
    });

    doc.save('sugestao-compras.pdf');
  };

  return (
    <AppLayout title="Sugestão de Compras">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600 dark:text-slate-300">Período (dias)</label>
            <input
              type="number"
              min={15}
              max={180}
              className="app-input w-24"
              value={periodDays}
              onChange={(e) => setPeriodDays(Number(e.target.value) || 60)}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600 dark:text-slate-300">Cobertura (meses)</label>
            <input
              type="number"
              min={1}
              max={6}
              className="app-input w-20"
              value={targetMonths}
              onChange={(e) => setTargetMonths(Number(e.target.value) || 2)}
            />
          </div>
          <button
            onClick={load}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold"
            disabled={loading}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            Recalcular
          </button>
          <button
            onClick={gerarPdf}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold"
          >
            <FileDown className="w-4 h-4" />
            Gerar PDF
          </button>
          <div className="text-sm text-slate-500">
            Total sugerido (unidades): <span className="font-semibold text-slate-800 dark:text-white">{totalCompra.toLocaleString('pt-BR')}</span>
          </div>
        </div>

        {erro && <div className="text-sm text-rose-500">{erro}</div>}

        <div className="rounded-[28px] glass-panel border border-white/60 dark:border-white/10 overflow-hidden">
          <div className="overflow-auto scrollbar-hide">
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="bg-white/70 dark:bg-slate-900/70">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">EAN</th>
                  <th className="px-4 py-3">Código fornecedor</th>
                  <th className="px-4 py-3">Emb.</th>
                  <th className="px-4 py-3">Estoque disp.</th>
                  <th className="px-4 py-3">Consumo período</th>
                  <th className="px-4 py-3">Consumo mensal</th>
                  <th className="px-4 py-3">Sugestão base</th>
                  <th className="px-4 py-3">Pedido (ajust.)</th>
                  <th className="px-4 py-3">Observações (PDF)</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/40 dark:divide-slate-800/50">
                {derivados.map((p, idx) => (
                  <tr key={p.id_produto_tiny} className="align-top">
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-white/50 dark:border-white/15 bg-white/60 dark:bg-white/10 backdrop-blur-md text-[#009DA8] text-xs font-extrabold shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 dark:text-white">{p.nome || 'Sem nome'}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.codigo || '-'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.gtin || '-'}</td>
                    <td className="px-4 py-3">
                      <input
                        className="app-input w-36"
                        value={p.fornecedor_codigo || ''}
                        onChange={(e) =>
                          setDados((prev) =>
                            prev.map((x) =>
                              x.id_produto_tiny === p.id_produto_tiny ? { ...x, fornecedor_codigo: e.target.value } : x
                            )
                          )
                        }
                        placeholder="Código forn."
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={1}
                        className="app-input w-20"
                        value={p.embalagem_qtd}
                        onChange={(e) =>
                          setDados((prev) =>
                            prev.map((x) =>
                              x.id_produto_tiny === p.id_produto_tiny ? { ...x, embalagem_qtd: Number(e.target.value) || 1 } : x
                            )
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-900 dark:text-white font-semibold">{p.disponivel.toLocaleString('pt-BR')}</div>
                      <div className="text-[11px] text-slate-500">Saldo {p.saldo ?? 0} · Reservado {p.reservado ?? 0}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-900 dark:text-white">{p.consumo_periodo.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3 text-slate-900 dark:text-white">
                      {p.consumo_mensal.toFixed(1)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 dark:text-white">{p.sugestao_base.toFixed(1)}</div>
                      {p.alerta_embalagem && (
                        <div className="text-[11px] text-amber-600">Abaixo do lote ({p.embalagem_qtd})</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{p.sugestao_ajustada.toLocaleString('pt-BR')}</div>
                    </td>
                    <td className="px-4 py-3">
                      <textarea
                        className="app-input w-56 min-h-[64px]"
                        value={observacoes[p.id_produto_tiny] || ''}
                        onChange={(e) =>
                          setObservacoes((prev) => ({ ...prev, [p.id_produto_tiny]: e.target.value }))
                        }
                        placeholder="Mensagem para fornecedor"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => salvarProduto(p.id_produto_tiny, p.fornecedor_codigo, p.embalagem_qtd)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                        disabled={savingId === p.id_produto_tiny}
                      >
                        {savingId === p.id_produto_tiny ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        Salvar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
