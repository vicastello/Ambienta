'use client';

import { useState, useEffect, useMemo } from 'react';
import { CheckCircle, AlertCircle, Loader2, ArrowLeft, ArrowRight, Settings, Link as LinkIcon } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import PaymentPreviewTable, { type PreviewPayment } from '../fluxo-caixa/components/PaymentPreviewTable';
import ManualLinkModal from '../fluxo-caixa/components/ManualLinkModal';
import EditTagsModal from '../fluxo-caixa/components/EditTagsModal';
import RulesManager from '../fluxo-caixa/components/RulesManager';
import { cn } from '@/lib/utils';

// New components
import { FileUploadZone } from './components/FileUploadZone';
import { ImportStepper, type StepperStep } from './components/ImportStepper';
import { MarketplaceSelector, getMarketplaceConfig, type Marketplace } from './components/MarketplaceSelector';
import { ImportHistory, type ImportHistoryItem } from './components/ImportHistory';
import { ImportCalendar, type ImportedDate } from './components/ImportCalendar';

type ImportStep = 'upload' | 'preview' | 'complete';

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

const STEPPER_STEPS: StepperStep[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'preview', label: 'Preview & Review' },
    { id: 'complete', label: 'Concluído' },
];

export default function ImportarPagamentosPage() {
    const [activeTab, setActiveTab] = useState<'import' | 'rules'>('import');
    const [step, setStep] = useState<ImportStep>('upload');
    const [marketplace, setMarketplace] = useState<Marketplace>('shopee');
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
    const [confirmResult, setConfirmResult] = useState<any>(null);
    const [history, setHistory] = useState<ImportHistoryItem[]>([]);
    const [showManualLinkModal, setShowManualLinkModal] = useState(false);
    const [showEditTagsModal, setShowEditTagsModal] = useState(false);
    const [selectedPayment, setSelectedPayment] = useState<PreviewPayment | null>(null);
    const [ruleFeedback, setRuleFeedback] = useState<{ message: string; count: number } | null>(null);

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

    // Transform history to calendar format
    const calendarDates = useMemo((): ImportedDate[] => {
        const dates: ImportedDate[] = [];
        history.forEach(item => {
            if (item.dateRange.start && item.dateRange.end) {
                // Add entries for each day in the range
                const start = new Date(item.dateRange.start);
                const end = new Date(item.dateRange.end);
                for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    dates.push({
                        date: d.toISOString().split('T')[0],
                        marketplace: item.marketplace as Marketplace,
                        paymentsCount: Math.ceil(item.paymentsCount / ((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1)),
                    });
                }
            }
        });
        return dates;
    }, [history]);

    const handleFileSelect = (selectedFile: File | null) => {
        setFile(selectedFile);
        setPreviewData(null); // Clear any previous errors
    };

    const handleMarketplaceChange = (newMarketplace: Marketplace) => {
        setMarketplace(newMarketplace);
        setFile(null); // Clear file when marketplace changes (different format)
        setPreviewData(null);
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
        setShowManualLinkModal(false);
    };

    const handleEditTags = (payment: PreviewPayment) => {
        setSelectedPayment(payment);
        setShowEditTagsModal(true);
    };

    const handleSaveTags = async (updatedTags: string[], createRule: boolean, updatedType?: string, updatedDescription?: string) => {
        if (!selectedPayment || !previewData) return;

        // Build pattern for matching similar entries
        const patternStr = updatedDescription && updatedDescription.length > 10
            ? `.*${updatedDescription.substring(0, 30)}.*`
            : updatedDescription ? `.*${updatedDescription}.*` : null;

        let patternRegex: RegExp | null = null;
        if (patternStr && createRule) {
            try {
                patternRegex = new RegExp(patternStr, 'i');
            } catch {
                patternRegex = null;
            }
        }

        // Update payments - if creating rule, apply to ALL matching entries
        const updatedPayments = previewData.payments.map(p => {
            // Always update the selected payment
            if (p.marketplaceOrderId === selectedPayment.marketplaceOrderId) {
                return {
                    ...p,
                    tags: updatedTags,
                    transactionType: updatedType || p.transactionType,
                    transactionDescription: updatedDescription || p.transactionDescription,
                };
            }

            // If creating rule, also update other matching entries
            if (createRule && patternRegex) {
                const textToMatch = `${p.transactionDescription || ''} ${p.transactionType || ''}`;
                if (patternRegex.test(textToMatch)) {
                    // Merge new tags with existing ones (avoid duplicates)
                    const mergedTags = [...new Set([...p.tags, ...updatedTags])];
                    return { ...p, tags: mergedTags };
                }
            }

            return p;
        });

        // Count how many entries were affected (excluding the selected one)
        const otherMatchCount = createRule && patternRegex
            ? previewData.payments.filter(p => {
                if (p.marketplaceOrderId === selectedPayment.marketplaceOrderId) return false;
                const textToMatch = `${p.transactionDescription || ''} ${p.transactionType || ''}`;
                return patternRegex!.test(textToMatch);
            }).length
            : 0;

        setPreviewData({ ...previewData, payments: updatedPayments });

        if (createRule && updatedDescription) {
            try {
                await fetch('/api/financeiro/pagamentos/auto-link-rules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        marketplace: previewData.marketplace,
                        transaction_type_pattern: patternStr,
                        action: 'auto_tag',
                        tags: updatedTags,
                        priority: 50,
                    }),
                });

                // Show visual feedback with count
                const totalApplied = otherMatchCount + 1;
                setRuleFeedback({
                    message: otherMatchCount > 0
                        ? `✅ Regra criada e aplicada a ${totalApplied} entrada(s)`
                        : '✅ Regra criada com sucesso',
                    count: totalApplied,
                });

                // Auto-hide feedback after 5 seconds
                setTimeout(() => setRuleFeedback(null), 5000);
            } catch (error) {
                console.error('Error creating auto-rule:', error);
                setRuleFeedback({ message: '❌ Erro ao criar regra', count: 0 });
                setTimeout(() => setRuleFeedback(null), 3000);
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

    const marketplaceConfig = getMarketplaceConfig(marketplace);

    return (
        <AppLayout title="Importar Pagamentos">
            <div className="space-y-6 pb-6">
                <Breadcrumb items={[
                    { label: 'Financeiro', href: '/financeiro' },
                    { label: 'Fluxo de Caixa', href: '/financeiro/fluxo-caixa' },
                    { label: 'Importar Pagamentos' }
                ]} />

                {/* Header Section */}
                <section className="glass-panel glass-tint rounded-[32px] border border-white/60 dark:border-white/10 p-6 md:p-8">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="space-y-1">
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Financeiro</p>
                            <h1 className="text-2xl md:text-3xl font-semibold text-slate-900 dark:text-white">
                                Importar Pagamentos
                            </h1>
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                                Importe extratos de marketplaces para reconciliação automática
                            </p>
                        </div>
                        <button
                            onClick={() => setActiveTab(activeTab === 'import' ? 'rules' : 'import')}
                            className="app-btn-secondary inline-flex items-center gap-2 self-start"
                        >
                            {activeTab === 'import' ? (
                                <>
                                    <Settings className="w-4 h-4" />
                                    Gerenciar Regras
                                </>
                            ) : (
                                <>
                                    <ArrowLeft className="w-4 h-4" />
                                    Voltar para Importação
                                </>
                            )}
                        </button>
                    </div>
                </section>

                {/* Tab Content */}
                {activeTab === 'rules' ? (
                    <div className="glass-panel glass-tint rounded-[32px] border border-white/40 dark:border-white/10 p-6 md:p-8">
                        <RulesManager />
                    </div>
                ) : (
                    <>
                        {/* Stepper */}
                        <ImportStepper steps={STEPPER_STEPS} currentStep={step} />

                        {/* Step 1: Upload */}
                        {step === 'upload' && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Main Upload Area (2 columns) */}
                                <div className="lg:col-span-2 space-y-6">
                                    <div className="glass-panel glass-tint rounded-[32px] border border-white/40 dark:border-white/10 p-6 md:p-8">
                                        <div className="mb-6">
                                            <h2 className="text-xl font-semibold text-main mb-1">Upload de Extrato</h2>
                                            <p className="text-sm text-muted">Selecione o marketplace e o arquivo de extrato</p>
                                        </div>

                                        {/* Marketplace Selector */}
                                        <div className="mb-6">
                                            <label className="block text-sm font-medium text-main mb-3">Marketplace</label>
                                            <MarketplaceSelector
                                                selected={marketplace}
                                                onSelect={handleMarketplaceChange}
                                                disabled={uploading}
                                            />
                                        </div>

                                        {/* File Upload */}
                                        <div className="mb-6">
                                            <label className="block text-sm font-medium text-main mb-3">Arquivo</label>
                                            <FileUploadZone
                                                file={file}
                                                onFileSelect={handleFileSelect}
                                                acceptedTypes={marketplaceConfig?.acceptedTypes || '.xlsx'}
                                                formatHint={`Formato aceito: ${marketplaceConfig?.format || 'XLSX'}`}
                                                disabled={uploading}
                                            />
                                        </div>

                                        {/* Submit Button */}
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

                                    {/* Import History (Collapsible) */}
                                    <ImportHistory history={history} maxItems={5} />
                                </div>

                                {/* Sidebar: Calendar (1 column) */}
                                <div className="lg:col-span-1">
                                    <ImportCalendar importedDates={calendarDates} />
                                </div>
                            </div>
                        )}

                        {/* Step 2: Preview */}
                        {step === 'preview' && previewData && (
                            <div className="space-y-6">
                                {/* Summary Cards */}
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                                    <div className="glass-panel p-4 rounded-xl">
                                        <p className="text-sm text-muted mb-1">Total</p>
                                        <p className="text-2xl font-bold text-main">{previewData.summary.total}</p>
                                    </div>
                                    <div className="glass-panel p-4 rounded-xl relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/6 via-emerald-500/2 to-transparent pointer-events-none" />
                                        <div className="relative z-10">
                                            <p className="text-sm text-muted mb-1">Entradas</p>
                                            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                                {previewData.payments.filter(p => !p.isExpense).length}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="glass-panel p-4 rounded-xl relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-t from-rose-500/6 via-rose-500/2 to-transparent pointer-events-none" />
                                        <div className="relative z-10">
                                            <p className="text-sm text-muted mb-1">Saídas</p>
                                            <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                                                {previewData.payments.filter(p => p.isExpense).length}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="glass-panel p-4 rounded-xl relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-t from-blue-500/6 via-blue-500/2 to-transparent pointer-events-none" />
                                        <div className="relative z-10">
                                            <p className="text-sm text-muted mb-1">Vinculados</p>
                                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{previewData.summary.linked}</p>
                                        </div>
                                    </div>
                                    <div className="glass-panel p-4 rounded-xl relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-t from-red-500/6 via-red-500/2 to-transparent pointer-events-none" />
                                        <div className="relative z-10">
                                            <p className="text-sm text-muted mb-1">Não Vinculados</p>
                                            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{previewData.summary.unmatched}</p>
                                        </div>
                                    </div>
                                    <div className="glass-panel p-4 rounded-xl relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-t from-amber-500/6 via-amber-500/2 to-transparent pointer-events-none" />
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

                                    {/* Rule application feedback */}
                                    {ruleFeedback && (
                                        <div className={cn(
                                            "mb-4 p-3 rounded-xl flex items-center gap-2 transition-all animate-in fade-in slide-in-from-top-2",
                                            ruleFeedback.count > 0
                                                ? "bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800"
                                                : "bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800"
                                        )}>
                                            <span className="text-sm font-medium">{ruleFeedback.message}</span>
                                            <button
                                                onClick={() => setRuleFeedback(null)}
                                                className="ml-auto text-muted hover:text-main"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    )}

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
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                        <CheckCircle className="w-10 h-10 text-emerald-500" />
                                    </div>
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
