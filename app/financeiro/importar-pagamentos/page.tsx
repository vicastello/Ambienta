'use client';

import { useState } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';

type Marketplace = 'magalu' | 'mercado_livre' | 'shopee';

type UploadResult = {
    success: boolean;
    batchId?: string;
    rowsProcessed?: number;
    rowsMatched?: number;
    rowsSkipped?: number;
    matchRate?: string;
    unmatchedOrders?: string[];
    errors?: string[];
};

export default function ImportarPagamentosPage() {
    const [marketplace, setMarketplace] = useState<Marketplace>('magalu');
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<UploadResult | null>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setResult(null);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setFile(e.dataTransfer.files[0]);
            setResult(null);
        }
    };

    const handleUpload = async () => {
        if (!file) return;

        setUploading(true);
        setResult(null);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('marketplace', marketplace);

            const response = await fetch('/api/financeiro/pagamentos/upload', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();
            setResult(data);

            if (data.success) {
                setFile(null);
            }
        } catch (error) {
            setResult({
                success: false,
                errors: ['Erro ao fazer upload: ' + (error instanceof Error ? error.message : 'Erro desconhecido')],
            });
        } finally {
            setUploading(false);
        }
    };

    return (
        <AppLayout title="Importar Pagamentos">
            <div className="space-y-6 pb-6">
                {/* Header */}
                <section className="glass-panel glass-tint rounded-[32px] border border-white/60 dark:border-white/10 p-6 md:p-8">
                    <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Financeiro</p>
                        <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">
                            Importar Pagamentos
                        </h1>
                        <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
                            Importe extratos de pagamentos dos marketplaces para marcar automaticamente pedidos como recebidos
                        </p>
                    </div>
                </section>

                {/* Upload Area */}
                <div className="glass-panel glass-tint rounded-[32px] border border-white/40 dark:border-white/10 p-6 md:p-8">
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold text-main mb-1">Upload de Extrato</h2>
                        <p className="text-sm text-muted">Selecione o marketplace e o arquivo de extrato</p>
                    </div>

                    {/* Marketplace selector */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-main mb-3">Marketplace</label>
                        <div className="flex gap-3">
                            {(['magalu', 'mercado_livre', 'shopee'] as const).map((mp) => (
                                <button
                                    key={mp}
                                    onClick={() => setMarketplace(mp)}
                                    className={`px-4 py-2 rounded-xl font-medium transition-all ${marketplace === mp
                                        ? 'bg-accent text-white'
                                        : 'bg-white/50 dark:bg-white/5 text-main hover:bg-white/70 dark:hover:bg-white/10'
                                        }`}
                                >
                                    {mp === 'magalu' && 'Magalu'}
                                    {mp === 'mercado_livre' && 'Mercado Livre'}
                                    {mp === 'shopee' && 'Shopee'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* File upload area */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-main mb-3">Arquivo</label>
                        <div
                            onDrop={handleDrop}
                            onDragOver={(e) => e.preventDefault()}
                            className="border-2 border-dashed border-white/30 dark:border-white/10 rounded-2xl p-8 text-center hover:border-accent/50 transition-colors cursor-pointer"
                            onClick={() => document.getElementById('file-input')?.click()}
                        >
                            <Upload className="w-12 h-12 mx-auto mb-4 text-muted" />
                            {file ? (
                                <div>
                                    <p className="text-main font-medium mb-1">{file.name}</p>
                                    <p className="text-sm text-muted">{(file.size / 1024).toFixed(1)} KB</p>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-main font-medium mb-1">Arraste o arquivo aqui ou clique para selecionar</p>
                                    <p className="text-sm text-muted">
                                        {marketplace === 'magalu' && 'Formato aceito: CSV'}
                                        {marketplace !== 'magalu' && 'Formato aceito: XLSX'}
                                    </p>
                                </div>
                            )}
                            <input
                                id="file-input"
                                type="file"
                                accept={marketplace === 'magalu' ? '.csv' : '.xlsx'}
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleUpload}
                        disabled={!file || uploading}
                        className="app-btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {uploading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Processando...
                            </>
                        ) : (
                            <>
                                <Upload className="w-4 h-4" />
                                Importar Pagamentos
                            </>
                        )}
                    </button>
                </div>

                {/* Result */}
                {result && (
                    <div className={`glass-panel glass-tint rounded-[32px] border p-6 ${result.success
                        ? 'border-emerald-500/30 bg-emerald-50/5'
                        : 'border-rose-500/30 bg-rose-50/5'
                        }`}>
                        <div className="flex items-start gap-3">
                            {result.success ? (
                                <CheckCircle className="w-6 h-6 text-emerald-500 flex-shrink-0 mt-0.5" />
                            ) : (
                                <AlertCircle className="w-6 h-6 text-rose-500 flex-shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1">
                                <h3 className="font-semibold text-main mb-2">
                                    {result.success ? 'Importação concluída!' : 'Erro na importação'}
                                </h3>

                                {result.success && (
                                    <div className="space-y-2 text-sm">
                                        <p className="text-muted">
                                            <span className="font-medium text-main">{result.rowsProcessed}</span> linhas processadas
                                        </p>
                                        <p className="text-muted">
                                            <span className="font-medium text-emerald-600 dark:text-emerald-400">{result.rowsMatched}</span> vinculadas com sucesso ({result.matchRate})
                                        </p>
                                        {(result.rowsSkipped ?? 0) > 0 && (
                                            <p className="text-muted">
                                                <span className="font-medium text-amber-600 dark:text-amber-400">{result.rowsSkipped}</span> ignoradas (duplicadas)
                                            </p>
                                        )}
                                        {result.unmatchedOrders && result.unmatchedOrders.length > 0 && (
                                            <details className="mt-4">
                                                <summary className="cursor-pointer text-amber-600 dark:text-amber-400 font-medium">
                                                    {result.unmatchedOrders.length} pedidos não vinculados
                                                </summary>
                                                <div className="mt-2 p-3 rounded-lg bg-white/50 dark:bg-white/5">
                                                    <p className="text-xs text-muted mb-2">IDs dos pedidos:</p>
                                                    <p className="text-xs font-mono text-main">
                                                        {result.unmatchedOrders.join(', ')}
                                                    </p>
                                                </div>
                                            </details>
                                        )}
                                    </div>
                                )}

                                {!result.success && result.errors && (
                                    <div className="mt-2">
                                        {result.errors.map((error, index) => (
                                            <p key={index} className="text-sm text-rose-600 dark:text-rose-400">
                                                {error}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Info boxes */}
                <div className="grid md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-500/10 border border-blue-200/60 dark:border-blue-500/20">
                        <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">Magalu</h3>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                            Exporte o relatório de pagamentos em formato CSV
                        </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-500/10 border border-blue-200/60 dark:border-blue-500/20">
                        <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">Mercado Livre</h3>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                            Baixe o extrato de vendas em formato XLSX
                        </p>
                    </div>
                    <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-500/10 border border-blue-200/60 dark:border-blue-500/20">
                        <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">Shopee</h3>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                            Exporte o relatório financeiro em XLSX
                        </p>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
