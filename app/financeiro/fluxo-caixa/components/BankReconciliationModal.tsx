'use client';

import { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { Landmark, Upload, Loader2, CheckCircle2, AlertCircle, X, ArrowRight, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import Papa from 'papaparse';
import { parseOFX, isValidOFX, ofxToCSVFormat } from '../utils/ofxParser';

// Types for bank statement entries
type BankEntry = {
    date: string;
    description: string;
    amount: number;
    type: 'credit' | 'debit';
    originalRow: Record<string, any>;
};

type MatchCandidate = {
    id: string;
    description: string;
    amount: number;
    dueDate: string;
    status: string;
    confidence: 'high' | 'medium' | 'low';
    matchReason: string;
};

type BankEntryWithMatch = BankEntry & {
    matches: MatchCandidate[];
    selectedMatch: MatchCandidate | null;
    status: 'pending' | 'matched' | 'skipped';
};

// Common column names for auto-detection
const DATE_COLUMNS = ['data', 'date', 'dt', 'data_lancamento', 'dt_lancamento', 'data lancamento'];
const DESC_COLUMNS = ['descricao', 'description', 'desc', 'historico', 'histórico', 'memo', 'observacao'];
const AMOUNT_COLUMNS = ['valor', 'amount', 'value', 'vlr', 'valor_lancamento'];
const CREDIT_COLUMNS = ['credito', 'credit', 'entrada', 'receita'];
const DEBIT_COLUMNS = ['debito', 'debit', 'saida', 'despesa'];

function normalizeColumnName(col: string): string {
    return col.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function findColumn(headers: string[], candidates: string[]): string | null {
    for (const candidate of candidates) {
        const found = headers.find(h => normalizeColumnName(h).includes(candidate));
        if (found) return found;
    }
    return null;
}

function parseDate(dateStr: string): string | null {
    if (!dateStr) return null;
    // Try DD/MM/YYYY format
    const slashParts = dateStr.split('/');
    if (slashParts.length === 3) {
        const [d, m, y] = slashParts;
        if (d.length === 2 && m.length === 2 && (y.length === 4 || y.length === 2)) {
            const year = y.length === 2 ? `20${y}` : y;
            return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
    }
    // Try YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
    }
    return null;
}

function parseAmount(value: string | number): number {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    // Handle Brazilian format: "1.234,56" -> 1234.56
    const cleaned = value
        .replace(/[^\d,.-]/g, '')
        .replace(/\.(?=.*\d{3})/g, '') // Remove thousands separator
        .replace(',', '.');
    return parseFloat(cleaned) || 0;
}

export function BankReconciliationModal() {
    const [open, setOpen] = useState(false);
    const [step, setStep] = useState<'upload' | 'mapping' | 'matching' | 'review'>('upload');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // CSV data
    const [rawData, setRawData] = useState<Record<string, any>[]>([]);
    const [headers, setHeaders] = useState<string[]>([]);

    // Column mapping
    const [dateColumn, setDateColumn] = useState<string>('');
    const [descColumn, setDescColumn] = useState<string>('');
    const [amountColumn, setAmountColumn] = useState<string>('');
    const [creditColumn, setCreditColumn] = useState<string>('');
    const [debitColumn, setDebitColumn] = useState<string>('');

    // Parsed entries
    const [entries, setEntries] = useState<BankEntryWithMatch[]>([]);

    // Results
    const [matchedCount, setMatchedCount] = useState(0);

    const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setError(null);

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            const fileName = file.name.toLowerCase();

            // Check if it's an OFX/QFX file
            if (fileName.endsWith('.ofx') || fileName.endsWith('.qfx') || isValidOFX(content)) {
                try {
                    const statement = parseOFX(content);
                    const { headers, rows } = ofxToCSVFormat(statement);

                    // Convert to object array format
                    const data = rows.map(row => {
                        const obj: Record<string, any> = {};
                        headers.forEach((h, i) => obj[h] = row[i]);
                        return obj;
                    });

                    setRawData(data);
                    setHeaders(headers);

                    // Auto-set columns for OFX
                    setDateColumn('Data');
                    setDescColumn('Descrição');
                    setAmountColumn('Valor');
                    setCreditColumn('');
                    setDebitColumn('');

                    setStep('mapping');
                    setLoading(false);
                } catch (err) {
                    setError(err instanceof Error ? err.message : 'Erro ao processar arquivo OFX');
                    setLoading(false);
                }
                return;
            }

            // CSV parsing
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    if (results.errors.length) {
                        setError(`Erro ao ler CSV: ${results.errors[0].message}`);
                        setLoading(false);
                        return;
                    }

                    const data = results.data as Record<string, any>[];
                    if (!data.length) {
                        setError('Arquivo vazio ou sem dados válidos');
                        setLoading(false);
                        return;
                    }

                    const headers = Object.keys(data[0]);
                    setRawData(data);
                    setHeaders(headers);

                    // Auto-detect columns
                    setDateColumn(findColumn(headers, DATE_COLUMNS) || '');
                    setDescColumn(findColumn(headers, DESC_COLUMNS) || '');
                    setAmountColumn(findColumn(headers, AMOUNT_COLUMNS) || '');
                    setCreditColumn(findColumn(headers, CREDIT_COLUMNS) || '');
                    setDebitColumn(findColumn(headers, DEBIT_COLUMNS) || '');

                    setStep('mapping');
                    setLoading(false);
                },
                error: (error) => {
                    setError(`Erro ao processar arquivo: ${error.message}`);
                    setLoading(false);
                },
            });
        };
        reader.readAsText(file);
    }, []);

    const handleProceedToMatching = async () => {
        if (!dateColumn || !descColumn || (!amountColumn && !creditColumn)) {
            setError('Selecione ao menos Data, Descrição e Valor (ou Crédito)');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Parse entries
            const parsed: BankEntry[] = rawData
                .map(row => {
                    const date = parseDate(row[dateColumn]);
                    const desc = row[descColumn]?.toString() || '';

                    let amount = 0;
                    let type: 'credit' | 'debit' = 'credit';

                    if (amountColumn) {
                        amount = parseAmount(row[amountColumn]);
                        type = amount >= 0 ? 'credit' : 'debit';
                        amount = Math.abs(amount);
                    } else {
                        const credit = parseAmount(row[creditColumn]);
                        const debit = parseAmount(row[debitColumn]);
                        if (credit > 0) {
                            amount = credit;
                            type = 'credit';
                        } else if (debit > 0) {
                            amount = debit;
                            type = 'debit';
                        }
                    }

                    return {
                        date: date || '',
                        description: desc,
                        amount,
                        type,
                        originalRow: row,
                    };
                })
                .filter(e => e.date && e.amount > 0);

            if (!parsed.length) {
                setError('Nenhuma entrada válida encontrada');
                setLoading(false);
                return;
            }

            // Fetch pending cash flow entries for matching
            const creditsOnly = parsed.filter(e => e.type === 'credit');
            if (creditsOnly.length === 0) {
                setEntries(parsed.map(e => ({
                    ...e,
                    matches: [],
                    selectedMatch: null,
                    status: 'pending',
                })));
                setStep('matching');
                setLoading(false);
                return;
            }

            // Call API to get potential matches
            const res = await fetch('/api/financeiro/fluxo-caixa/pedidos?limite=200&status=pendentes');
            const data = await res.json();
            const pendingOrders = data.orders || [];

            // Match entries
            const entriesWithMatches: BankEntryWithMatch[] = parsed.map(entry => {
                if (entry.type !== 'credit') {
                    return { ...entry, matches: [], selectedMatch: null, status: 'pending' as const };
                }

                // Find potential matches based on amount proximity
                const matches: MatchCandidate[] = pendingOrders
                    .filter((order: any) => {
                        const orderAmount = order.valor || 0;
                        const diff = Math.abs(orderAmount - entry.amount);
                        const percentDiff = orderAmount > 0 ? (diff / orderAmount) * 100 : 100;
                        return percentDiff <= 5; // Within 5% tolerance
                    })
                    .map((order: any) => {
                        const diff = Math.abs((order.valor || 0) - entry.amount);
                        const percentDiff = order.valor > 0 ? (diff / order.valor) * 100 : 100;

                        let confidence: 'high' | 'medium' | 'low' = 'low';
                        let matchReason = '';

                        if (percentDiff < 0.01) {
                            confidence = 'high';
                            matchReason = 'Valor exato';
                        } else if (percentDiff < 2) {
                            confidence = 'medium';
                            matchReason = `Valor próximo (${percentDiff.toFixed(1)}% diferença)`;
                        } else {
                            matchReason = `Valor com ${percentDiff.toFixed(1)}% diferença`;
                        }

                        return {
                            id: order.id?.toString() || order.tiny_id?.toString(),
                            description: order.cliente || order.numero_pedido || 'N/A',
                            amount: order.valor || 0,
                            dueDate: order.vencimento_estimado || order.data_pedido || '',
                            status: order.status_pagamento || 'pendente',
                            confidence,
                            matchReason,
                        };
                    })
                    .sort((a: MatchCandidate, b: MatchCandidate) => {
                        const confOrder = { high: 0, medium: 1, low: 2 };
                        return confOrder[a.confidence] - confOrder[b.confidence];
                    })
                    .slice(0, 5);

                return {
                    ...entry,
                    matches,
                    selectedMatch: matches.find(m => m.confidence === 'high') || null,
                    status: matches.some(m => m.confidence === 'high') ? 'matched' as const : 'pending' as const,
                };
            });

            setEntries(entriesWithMatches);
            setMatchedCount(entriesWithMatches.filter(e => e.status === 'matched').length);
            setStep('matching');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao processar entradas');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectMatch = (entryIndex: number, match: MatchCandidate | null) => {
        setEntries(prev => prev.map((e, i) =>
            i === entryIndex
                ? { ...e, selectedMatch: match, status: match ? 'matched' : 'pending' }
                : e
        ));
    };

    const handleConfirmMatches = async () => {
        const toMatch = entries.filter(e => e.selectedMatch && e.status === 'matched');
        if (!toMatch.length) {
            setError('Nenhum match selecionado');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const orderIds = toMatch
                .map(e => parseInt(e.selectedMatch?.id || '0'))
                .filter(id => id > 0);

            if (orderIds.length) {
                const res = await fetch('/api/financeiro/fluxo-caixa/mark-paid', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderIds }),
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Erro ao marcar como pago');
                }
            }

            setMatchedCount(toMatch.length);
            setStep('review');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao confirmar matches');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setStep('upload');
        setRawData([]);
        setHeaders([]);
        setEntries([]);
        setError(null);
        setMatchedCount(0);
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button className="app-btn-secondary inline-flex items-center gap-2">
                    <Landmark className="w-4 h-4" />
                    Conciliação
                </button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Landmark className="w-5 h-5" />
                        Conciliação Bancária
                    </DialogTitle>
                </DialogHeader>

                {/* Progress Steps */}
                <div className="flex items-center justify-between mb-6 px-4">
                    {['upload', 'mapping', 'matching', 'review'].map((s, i) => (
                        <div key={s} className="flex items-center">
                            <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                                step === s
                                    ? "bg-primary-500 text-white"
                                    : i < ['upload', 'mapping', 'matching', 'review'].indexOf(step)
                                        ? "bg-emerald-500 text-white"
                                        : "bg-slate-200 dark:bg-slate-700 text-slate-500"
                            )}>
                                {i < ['upload', 'mapping', 'matching', 'review'].indexOf(step)
                                    ? <CheckCircle2 className="w-4 h-4" />
                                    : i + 1
                                }
                            </div>
                            {i < 3 && (
                                <div className={cn(
                                    "w-12 h-0.5 mx-2",
                                    i < ['upload', 'mapping', 'matching', 'review'].indexOf(step)
                                        ? "bg-emerald-500"
                                        : "bg-slate-200 dark:bg-slate-700"
                                )} />
                            )}
                        </div>
                    ))}
                </div>

                {error && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-sm mb-4">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {/* Step: Upload */}
                {step === 'upload' && (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Importe o extrato bancário em CSV para conciliar automaticamente com os recebíveis pendentes.
                        </p>

                        <label className={cn(
                            "flex flex-col items-center justify-center w-full h-48 rounded-2xl border-2 border-dashed cursor-pointer transition-colors",
                            "border-slate-200 dark:border-white/10 hover:border-primary-400 hover:bg-primary-50/50 dark:hover:bg-primary-950/20"
                        )}>
                            <Upload className="w-10 h-10 text-slate-400 mb-3" />
                            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                Arraste o arquivo ou clique para selecionar
                            </span>
                            <span className="text-xs text-slate-400 mt-1">
                                Formatos: CSV, OFX, QFX (Itaú, Bradesco, Nubank, Inter, etc.)
                            </span>
                            <input
                                type="file"
                                accept=".csv,.ofx,.qfx"
                                className="hidden"
                                onChange={handleFileUpload}
                                disabled={loading}
                            />
                        </label>

                        {loading && (
                            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Processando arquivo...
                            </div>
                        )}
                    </div>
                )}

                {/* Step: Column Mapping */}
                {step === 'mapping' && (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Verifique se as colunas foram detectadas corretamente:
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Data *</label>
                                <select
                                    className="w-full rounded-lg border-slate-200 dark:border-white/10"
                                    value={dateColumn}
                                    onChange={e => setDateColumn(e.target.value)}
                                >
                                    <option value="">Selecione...</option>
                                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Descrição *</label>
                                <select
                                    className="w-full rounded-lg border-slate-200 dark:border-white/10"
                                    value={descColumn}
                                    onChange={e => setDescColumn(e.target.value)}
                                >
                                    <option value="">Selecione...</option>
                                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Valor (único)</label>
                                <select
                                    className="w-full rounded-lg border-slate-200 dark:border-white/10"
                                    value={amountColumn}
                                    onChange={e => setAmountColumn(e.target.value)}
                                >
                                    <option value="">Não usar</option>
                                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <div>
                                    <label className="block text-sm font-medium mb-1">Crédito</label>
                                    <select
                                        className="w-full rounded-lg border-slate-200 dark:border-white/10"
                                        value={creditColumn}
                                        onChange={e => setCreditColumn(e.target.value)}
                                        disabled={!!amountColumn}
                                    >
                                        <option value="">Não usar</option>
                                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="text-xs text-slate-500">
                            Prévia: {rawData.length} linhas encontradas
                        </div>

                        <div className="flex justify-between pt-4">
                            <button onClick={handleReset} className="app-btn-secondary">
                                Voltar
                            </button>
                            <button
                                onClick={handleProceedToMatching}
                                className="app-btn-primary flex items-center gap-2"
                                disabled={loading}
                            >
                                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                Continuar <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step: Matching */}
                {step === 'matching' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-slate-600 dark:text-slate-400">
                                {entries.filter(e => e.type === 'credit').length} créditos encontrados,
                                {' '}<span className="font-medium text-emerald-600">{entries.filter(e => e.status === 'matched').length}</span> auto-matched
                            </p>
                        </div>

                        <div className="max-h-[400px] overflow-y-auto space-y-2">
                            {entries.filter(e => e.type === 'credit').map((entry, idx) => (
                                <div key={idx} className={cn(
                                    "p-3 rounded-lg border transition-colors",
                                    entry.status === 'matched'
                                        ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
                                        : "border-slate-200 dark:border-white/10"
                                )}>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">
                                                    R$ {entry.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                                <span className="text-xs text-slate-400">{entry.date}</span>
                                            </div>
                                            <p className="text-xs text-slate-500 truncate">{entry.description}</p>
                                        </div>

                                        {entry.matches.length > 0 ? (
                                            <select
                                                className="text-sm rounded border-slate-200 dark:border-white/10 min-w-[200px]"
                                                value={entry.selectedMatch?.id || ''}
                                                onChange={e => {
                                                    const match = entry.matches.find(m => m.id === e.target.value);
                                                    handleSelectMatch(entries.indexOf(entry), match || null);
                                                }}
                                            >
                                                <option value="">Ignorar</option>
                                                {entry.matches.map(m => (
                                                    <option key={m.id} value={m.id}>
                                                        {m.description} - R$ {m.amount.toFixed(2)} ({m.matchReason})
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">Sem match</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between pt-4">
                            <button onClick={() => setStep('mapping')} className="app-btn-secondary">
                                Voltar
                            </button>
                            <button
                                onClick={handleConfirmMatches}
                                className="app-btn-primary flex items-center gap-2"
                                disabled={loading || !entries.some(e => e.status === 'matched')}
                            >
                                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                Confirmar {entries.filter(e => e.status === 'matched').length} matches
                            </button>
                        </div>
                    </div>
                )}

                {/* Step: Review */}
                {step === 'review' && (
                    <div className="text-center space-y-4 py-8">
                        <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                        <h3 className="text-xl font-semibold">Conciliação Concluída!</h3>
                        <p className="text-slate-600 dark:text-slate-400">
                            {matchedCount} pagamento(s) foram marcados como recebidos.
                        </p>
                        <button onClick={() => { handleReset(); setOpen(false); }} className="app-btn-primary">
                            Fechar
                        </button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
