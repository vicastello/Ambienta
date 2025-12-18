'use client';

import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { FileText, Calendar, Download, Loader2, Printer, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type ReportType = 'cashflow' | 'receivables' | 'summary';

const REPORT_TYPES = [
    { value: 'cashflow' as const, label: 'Fluxo de Caixa', desc: 'Receitas, despesas e saldos' },
    { value: 'receivables' as const, label: 'Recebíveis', desc: 'Pedidos e pagamentos' },
    { value: 'summary' as const, label: 'Resumo', desc: 'Visão geral do período' },
];

const PERIOD_PRESETS = [
    { label: 'Este mês', days: 0, type: 'month' },
    { label: 'Mês anterior', days: -1, type: 'month' },
    { label: 'Últimos 30 dias', days: 30, type: 'days' },
    { label: 'Últimos 90 dias', days: 90, type: 'days' },
    { label: 'Este ano', days: 0, type: 'year' },
];

function getDateRange(preset: typeof PERIOD_PRESETS[number]): { start: string; end: string } {
    const now = new Date();
    let start: Date;
    let end: Date;

    if (preset.type === 'month') {
        const targetMonth = now.getMonth() + preset.days;
        start = new Date(now.getFullYear(), targetMonth, 1);
        end = new Date(now.getFullYear(), targetMonth + 1, 0);
    } else if (preset.type === 'year') {
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31);
    } else {
        end = new Date();
        start = new Date();
        start.setDate(start.getDate() - preset.days);
    }

    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
    };
}

export function ReportModal() {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reportType, setReportType] = useState<ReportType>('cashflow');
    const [startDate, setStartDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    });

    const applyPreset = (preset: typeof PERIOD_PRESETS[number]) => {
        const { start, end } = getDateRange(preset);
        setStartDate(start);
        setEndDate(end);
    };

    const handleGenerate = useCallback(async (action: 'view' | 'download') => {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/financeiro/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reportType,
                    startDate,
                    endDate,
                    format: 'html',
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Erro ao gerar relatório');
            }

            const html = await res.text();

            // Create blob and open in new window for printing/PDF
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);

            if (action === 'view') {
                // Open in new window for viewing/printing
                const win = window.open(url, '_blank');
                if (win) {
                    win.onload = () => {
                        setTimeout(() => win.print(), 500);
                    };
                }
            } else {
                // Download as HTML (can be opened and printed)
                const a = document.createElement('a');
                a.href = url;
                a.download = `relatorio-${reportType}-${startDate}-${endDate}.html`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }

            URL.revokeObjectURL(url);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro desconhecido');
        } finally {
            setLoading(false);
        }
    }, [reportType, startDate, endDate]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button className="app-btn-secondary inline-flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Relatórios
                </button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-primary-500" />
                        Gerar Relatório
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 mt-4">
                    {/* Report Type */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Tipo de Relatório</label>
                        <div className="grid gap-2">
                            {REPORT_TYPES.map((type) => (
                                <button
                                    key={type.value}
                                    onClick={() => setReportType(type.value)}
                                    className={cn(
                                        "flex items-start gap-3 p-3 rounded-xl border text-left transition-all",
                                        reportType === type.value
                                            ? "border-primary-500 bg-primary-50 dark:bg-primary-950/20"
                                            : "border-slate-200 dark:border-white/10 hover:border-slate-300"
                                    )}
                                >
                                    <div className={cn(
                                        "w-4 h-4 rounded-full border-2 mt-0.5 transition-colors",
                                        reportType === type.value
                                            ? "border-primary-500 bg-primary-500"
                                            : "border-slate-300"
                                    )}>
                                        {reportType === type.value && (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <p className="font-medium text-sm">{type.label}</p>
                                        <p className="text-xs text-slate-500">{type.desc}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Period Presets */}
                    <div>
                        <label className="block text-sm font-medium mb-2">Período</label>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {PERIOD_PRESETS.map((preset, i) => (
                                <button
                                    key={i}
                                    onClick={() => applyPreset(preset)}
                                    className="px-3 py-1.5 text-xs font-medium rounded-full bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>

                        {/* Custom Date Range */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Início</label>
                                <div className="relative">
                                    <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="app-input w-full pl-9"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Fim</label>
                                <div className="relative">
                                    <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="app-input w-full pl-9"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-sm">
                            <AlertCircle className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            onClick={() => handleGenerate('download')}
                            disabled={loading}
                            className="app-btn-secondary flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            Baixar
                        </button>
                        <button
                            onClick={() => handleGenerate('view')}
                            disabled={loading}
                            className="app-btn-primary flex items-center gap-2"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                            Visualizar e Imprimir
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
