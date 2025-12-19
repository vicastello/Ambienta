'use client';

import { useState, useEffect } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader2, History, ArrowLeft, ArrowRight, FileUp, Settings } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import PaymentPreviewTable, { type PreviewPayment } from '../fluxo-caixa/components/PaymentPreviewTable';
import ManualLinkModal from '../fluxo-caixa/components/ManualLinkModal';
import EditTagsModal from '../fluxo-caixa/components/EditTagsModal';
import AutoLinkRulesManager from '../fluxo-caixa/components/AutoLinkRulesManager';
import { cn } from '@/lib/utils';

type Marketplace = 'magalu' | 'mercado_livre' | 'shopee';

type ImportStep = 'upload' | 'preview' | 'confirm' | 'complete';

type PreviewResponse = {
    success: boolean;
    sessionId?: string;
    marketplace: string;
    dateRange: {
        start: string | null;
        end: string | null;
    };
    payments: PreviewPayment[];
    summary: {
        total: number;
        linked: number;
        unmatched: number;
        multiEntry: number;
        matchRate: string;
    };
    errors?: string[];
};

type ImportHistory = {
    marketplace: string;
    dateRange: {
        start: string | null;
        end: string | null;
    };
    uploadedAt: string;
    paymentsCount: number;
};

export default function ImportarPagamentosPage() {
    const [activeTab, setActiveTab] = useState<'import' | 'rules'>('import');
    const [step, setStep] = useState<ImportStep>('upload');
    const [marketplace, setMarketplace] = useState<Marketplace>('shopee');
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
    const [confirmResult, setConfirmResult] = useState<any>(null);
    const [history, setHistory] = useState<ImportHistory[]>([]);
    const [showManualLinkModal, setShowManualLinkModal] = useState(false);
    const [showEditTagsModal, setShowEditTagsModal] = useState(false);
    const [selectedPayment, setSelectedPayment] = useState<PreviewPayment | null>(null);

    // Fetch import history on mount
    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            const response = await fetch('/api/financeiro/pagamentos/preview');
            const data = await response.json();
            if (data.success) {
                setHistory(data.history || []);
            }
        } catch (error) {
            console.error('Error fetching history:', error);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setFile(e.dataTransfer.files[0]);
        }
    };

    const handlePreview = async () => {
        if (!file) return;

        setUploading(true);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('marketplace', marketplace);

            const response = await fetch('/api/financeiro/pagamentos/preview', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (data.success) {
                setPreviewData(data);
                setStep('preview');
            } else {
                setPreviewData(data); // Show errors
            }
        } catch (error) {
            console.error('Preview error:', error);
        } finally {
            setUploading(false);
        }
    };

    const handleConfirmImport = async () => {
        if (!previewData?.sessionId) return;

        setConfirming(true);

        try {
            const response = await fetch('/api/financeiro/pagamentos/confirm-import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: previewData.sessionId,
                    payments: previewData.payments
                }),
            });

            const data = await response.json();

            if (data.success) {
                setConfirmResult(data);
                setStep('complete');
                fetchHistory(); // Refresh history
            }
        } catch (error) {
            console.error('Confirm error:', error);
        } finally {
            setConfirming(false);
        }
    };

    const handleManualLink = (payment: PreviewPayment) => {
        setSelectedPayment(payment);
        setShowManualLinkModal(true);
    };

    const handleLinkSuccess = () => {
        // Refresh preview data
        setShowManualLinkModal(false);
        // Optionally refetch preview
    };

    const handleEditTags = (payment: PreviewPayment) => {
        setSelectedPayment(payment);
        setShowEditTagsModal(true);
    };

    const handleSaveTags = async (updatedTags: string[], createRule: boolean, updatedType?: string, updatedDescription?: string) => {
        if (!selectedPayment || !previewData) return;

        // Update tags, type, and description in preview data
        const updatedPayments = previewData.payments.map(p =>
            p.marketplaceOrderId === selectedPayment.marketplaceOrderId
                ? {
                    ...p,
                    tags: updatedTags,
                    transactionType: updatedType || p.transactionType,
                    transactionDescription: updatedDescription || p.transactionDescription,
                }
                : p
        );
        setPreviewData({ ...previewData, payments: updatedPayments });

        // Create auto-link rule if requested
        if (createRule && updatedDescription) {
            try {
                // Use a more specific pattern from the edited description
                const pattern = updatedDescription.length > 10
                    ? `.*${updatedDescription.substring(0, 30)}.*`
                    : `.*${updatedDescription}.*`;

                await fetch('/api/financeiro/pagamentos/auto-link-rules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        marketplace: previewData.marketplace,
                        transaction_type_pattern: pattern,
                        action: 'auto_tag',
                        tags: updatedTags,
                        priority: 50,
                    }),
                });
            } catch (error) {
                console.error('Error creating auto-rule:', error);
            }
        }

        setShowEditTagsModal(false);
    };

    const handleStartOver = () => {
        setStep('upload');
        setFile(null);
        setPreviewData(null);
        setConfirmResult(null);
    };

    return (
        <AppLayout title="Importar Pagamentos">
            <div className="space-y-6 pb-6">
                <Breadcrumb items={[
                    { label: 'Financeiro', href: '/financeiro' },
                    { label: 'Fluxo de Caixa', href: '/financeiro/fluxo-caixa' },
                    { label: 'Importar Pagamentos' }
                ]} />

                {/* Header */}
                <section className="glass-panel glass-tint rounded-[32px] border border-white/60 dark:border-white/10 p-6 md:p-8">
                    <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Financeiro</p>
                        <h1 className="text-3xl font-semibold text-slate-900 dark:text-white">
                            Importar Pagamentos
                        </h1>
                        <p className="text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
                            Sistema de importação inteligente com preview, detecção automática de tags e vinculação manual
                        </p>
                    </div>
                </section>

                {/* Tabs Navigation */}
                <div className="flex gap-3 mb-6">
                    <button
                        onClick={() => setActiveTab('import')}
                        className={activeTab === 'import' ? 'app-btn-primary' : 'app-btn-secondary'}
                    >
                        <FileUp className="w-4 h-4" />
                        Importar Pagamentos
                    </button>
                    <button
                        onClick={() => setActiveTab('rules')}
                        className={activeTab === 'rules' ? 'app-btn-primary' : 'app-btn-secondary'}
                    >
                        <Settings className="w-4 h-4" />
                        Gerenciar Regras Automáticas
                    </button>
                </div>

                {/* Tab Content */}
                {activeTab === 'rules' ? (
                    <div className="glass-panel glass-tint rounded-[32px] border border-white/40 dark:border-white/10 p-6 md:p-8">
                        <AutoLinkRulesManager />
                    </div>
                ) : (
                    <>
                        {/* Import History (only show on upload step) */}
                        <div className="flex items-center justify-center gap-2">
                            {['upload', 'preview', 'complete'].map((s, i) => (
                                <div key={s} className="flex items-center">
                                    <div className={cn(
                                        'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all',
                                        step === s
                                            ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-md'
                                            : (step === 'preview' && s === 'upload') || (step === 'complete' && ['upload', 'preview'].includes(s))
                                                ? 'bg-blue-600/70 dark:bg-blue-500/70 text-white'
                                                : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                                    )}>
                                        <span>{i + 1}</span>
                                        <span className="hidden sm:inline">
                                            {s === 'upload' && 'Upload'}
                                            {s === 'preview' && 'Preview & Review'}
                                            {s === 'complete' && 'Concluído'}
                                        </span>
                                    </div>
                                    {i < 2 && (
                                        <ArrowRight className="w-4 h-4 mx-2 text-gray-400" />
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Import History */}
                        {step === 'upload' && history.length > 0 && (
                            <div className="glass-panel glass-tint rounded-[32px] border border-white/40 dark:border-white/10 p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <History className="w-5 h-5 text-blue-500" />
                                    <h2 className="text-lg font-semibold text-main">Histórico de Importações</h2>
                                </div>
                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {history.slice(0, 10).map((item, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/30 dark:bg-white/5">
                                            <div className="flex-1">
                                                <p className="text-sm font-medium capitalize">{item.marketplace.replace('_', ' ')}</p>
                                                <p className="text-xs text-muted">
                                                    {item.dateRange.start && item.dateRange.end
                                                        ? `${new Date(item.dateRange.start).toLocaleDateString('pt-BR')} - ${new Date(item.dateRange.end).toLocaleDateString('pt-BR')}`
                                                        : 'Sem período definido'
                                                    }
                                                </p>
                                            </div>
                                            <div className="text-right text-sm">
                                                <p className="font-semibold text-main">{item.paymentsCount} pagamentos</p>
                                                <p className="text-xs text-muted">
                                                    {new Date(item.uploadedAt).toLocaleDateString('pt-BR')}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Step 1: Upload */}
                        {step === 'upload' && (
                            <div className="glass-panel glass-tint rounded-[32px] border border-white/40 dark:border-white/10 p-6 md:p-8">
                                <div className="mb-6">
                                    <h2 className="text-xl font-semibold text-main mb-1">Upload de Extrato</h2>
                                    <p className="text-sm text-muted">Selecione o marketplace e o arquivo de extrato</p>
                                </div>

                                <div className="mb-6">
                                    <label className="block text-sm font-medium text-main mb-3">Marketplace</label>
                                    <div className="flex gap-3">
                                        {(['magalu', 'mercado_livre', 'shopee'] as const).map((mp) => (
                                            <button
                                                key={mp}
                                                onClick={() => setMarketplace(mp)}
                                                className={marketplace === mp ? 'app-btn-primary' : 'app-btn-secondary'}
                                            >
                                                {mp === 'magalu' && 'Magalu'}
                                                {mp === 'mercado_livre' && 'Mercado Livre'}
                                                {mp === 'shopee' && 'Shopee'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* File upload */}
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
                                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                                                    ⚠️ Máximo 500 registros por arquivo
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
                                    onClick={handlePreview}
                                    disabled={!file || uploading}
                                    className="app-btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {uploading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Analisando arquivo...
                                        </>
                                    ) : (
                                        <>
                                            <ArrowRight className="w-4 h-4" />
                                            Continuar para Preview
                                        </>
                                    )}
                                </button>

                                {/* Error display */}
                                {previewData && !previewData.success && (
                                    <div className="mt-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                        <div className="flex items-start gap-2">
                                            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                                            <div>
                                                <p className="font-medium text-red-900 dark:text-red-300 mb-1">Erro ao processar arquivo</p>
                                                {previewData.errors?.map((err, i) => (
                                                    <p key={i} className="text-sm text-red-700 dark:text-red-400">{err}</p>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step 2: Preview */}
                        {step === 'preview' && previewData && (
                            <div className="space-y-6">
                                {/* Summary Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="glass-panel p-4 rounded-xl">
                                        <p className="text-sm text-muted mb-1">Total</p>
                                        <p className="text-2xl font-bold text-main">{previewData.summary.total}</p>
                                    </div>
                                    <div className="glass-panel p-4 rounded-xl relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/6 via-emerald-500/2 to-transparent pointer-events-none"></div>
                                        <div className="relative z-10">
                                            <p className="text-sm text-muted mb-1">Vinculados</p>
                                            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{previewData.summary.linked}</p>
                                        </div>
                                    </div>
                                    <div className="glass-panel p-4 rounded-xl relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-t from-red-500/6 via-red-500/2 to-transparent pointer-events-none"></div>
                                        <div className="relative z-10">
                                            <p className="text-sm text-muted mb-1">Não Vinculados</p>
                                            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{previewData.summary.unmatched}</p>
                                        </div>
                                    </div>
                                    <div className="glass-panel p-4 rounded-xl relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-t from-amber-500/6 via-amber-500/2 to-transparent pointer-events-none"></div>
                                        <div className="relative z-10">
                                            <p className="text-sm text-muted mb-1">Múltiplas Entradas</p>
                                            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{previewData.summary.multiEntry}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Preview Table */}
                                <div className="glass-panel glass-tint rounded-[32px] border border-white/40 dark:border-white/10 p-6">
                                    <div className="mb-4">
                                        <h2 className="text-xl font-semibold text-main mb-1">Review de Pagamentos</h2>
                                        <p className="text-sm text-muted">
                                            Revise os pagamentos detectados, vincule manualmente os que precisam e confirme a importação
                                        </p>
                                    </div>
                                    <PaymentPreviewTable
                                        payments={previewData.payments}
                                        marketplace={previewData.marketplace}
                                        onManualLink={handleManualLink}
                                        onEditTags={handleEditTags}
                                    />
                                </div>

                                {/* Actions */}
                                <div className="flex items-center justify-between">
                                    <button
                                        onClick={handleStartOver}
                                        className="app-btn-secondary inline-flex items-center gap-2"
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleConfirmImport}
                                        disabled={confirming}
                                        className="app-btn-primary inline-flex items-center gap-2"
                                    >
                                        {confirming ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Importando...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle className="w-4 h-4" />
                                                Confirmar Importação ({previewData.summary.total} pagamentos)
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Complete */}
                        {step === 'complete' && confirmResult && (
                            <div className="glass-panel glass-tint rounded-[32px] border border-emerald-500/30 bg-emerald-50/5 p-6 md:p-8">
                                <div className="text-center max-w-2xl mx-auto">
                                    <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                                    <h2 className="text-2xl font-semibold text-main mb-2">Importação Concluída!</h2>
                                    <p className="text-muted mb-6">Todos os pagamentos foram processados e salvos com sucesso</p>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                                        <div className="p-4 rounded-lg bg-white/50 dark:bg-white/5">
                                            <p className="text-sm text-muted mb-1">Processados</p>
                                            <p className="text-2xl font-bold text-main">{confirmResult.rowsProcessed}</p>
                                        </div>
                                        <div className="p-4 rounded-lg bg-white/50 dark:bg-white/5">
                                            <p className="text-sm text-muted mb-1">Vinculados</p>
                                            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{confirmResult.rowsMatched}</p>
                                        </div>
                                        <div className="p-4 rounded-lg bg-white/50 dark:bg-white/5">
                                            <p className="text-sm text-muted mb-1">Taxa</p>
                                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{confirmResult.matchRate}</p>
                                        </div>
                                        <div className="p-4 rounded-lg bg-white/50 dark:bg-white/5">
                                            <p className="text-sm text-muted mb-1">Grupos</p>
                                            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{confirmResult.transactionGroupsCreated || 0}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-center gap-4">
                                        <button
                                            onClick={handleStartOver}
                                            className="app-btn-primary"
                                        >
                                            Nova Importação
                                        </button>
                                        <a
                                            href="/financeiro/fluxo-caixa"
                                            className="app-btn-secondary"
                                        >
                                            Ver Fluxo de Caixa
                                        </a>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Manual Link Modal */}
                        {showManualLinkModal && selectedPayment && (
                            <ManualLinkModal
                                isOpen={showManualLinkModal}
                                onClose={() => setShowManualLinkModal(false)}
                                payment={{
                                    marketplaceOrderId: selectedPayment.marketplaceOrderId,
                                    marketplace: previewData?.marketplace || 'shopee',
                                    netAmount: selectedPayment.netAmount,
                                    paymentDate: selectedPayment.paymentDate,
                                }}
                                sessionId={previewData?.sessionId}
                                onLinkSuccess={handleLinkSuccess}
                            />
                        )}

                        {/* Edit Tags Modal */}
                        {showEditTagsModal && selectedPayment && (
                            <EditTagsModal
                                isOpen={showEditTagsModal}
                                onClose={() => setShowEditTagsModal(false)}
                                payment={{
                                    marketplaceOrderId: selectedPayment.marketplaceOrderId,
                                    transactionDescription: selectedPayment.transactionDescription,
                                    transactionType: selectedPayment.transactionType,
                                    tags: selectedPayment.tags,
                                    isExpense: selectedPayment.isExpense,
                                    expenseCategory: selectedPayment.expenseCategory,
                                }}
                                marketplace={previewData?.marketplace || 'shopee'}
                                onSave={handleSaveTags}
                            />
                        )}
                    </>
                )}
            </div>
        </AppLayout>
    );
}
