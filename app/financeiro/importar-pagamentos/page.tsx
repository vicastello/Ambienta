'use client';

import { forceSyncOrder } from '@/app/financeiro/actions';


import { useState, useEffect, useMemo } from 'react';
import { CheckCircle, AlertCircle, Loader2, ArrowLeft, ArrowRight, Settings, Link as LinkIcon } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import PaymentPreviewTable, { type PreviewPayment } from '../fluxo-caixa/components/PaymentPreviewTable';
import ManualLinkModal from '../fluxo-caixa/components/ManualLinkModal';
import EditTagsModal from '../fluxo-caixa/components/EditTagsModal';
import RulesManager from '../fluxo-caixa/components/RulesManager';
import { cn } from '@/lib/utils';
import { DEFAULT_RULE_MARKETPLACES, type AutoRule, evaluateConditions } from '@/lib/rules';

import { FileUploadZone } from './components/FileUploadZone';
import { ImportStepper, type StepperStep } from './components/ImportStepper';
import { MarketplaceSelector, getMarketplaceConfig, type Marketplace } from './components/MarketplaceSelector';
import { ImportHistory, type ImportHistoryItem } from './components/ImportHistory';
import { ImportCalendar, type ImportedDate } from './components/ImportCalendar';
import { SyncBanner } from './components/SyncBanner';

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
    rulesAppliedBackend?: boolean;
    pendingEscrowOrders?: string[];
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
    const [syncKey, setSyncKey] = useState(0); // Key to reset sync banner
    const [syncCompleted, setSyncCompleted] = useState(false); // Prevents sync loop after completion
    const [selectedPayment, setSelectedPayment] = useState<PreviewPayment | null>(null);
    const [ruleFeedback, setRuleFeedback] = useState<{ message: string; count: number } | null>(null);
    const [pendingEscrowOrders, setPendingEscrowOrders] = useState<string[]>([]);

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
        setSyncCompleted(false); // Reset sync state for new file
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
                setPendingEscrowOrders(data.pendingEscrowOrders || []);
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
        // Update the preview data to show the payment as linked
        if (previewData && selectedPayment) {
            setPreviewData({
                ...previewData,
                payments: previewData.payments.map(p =>
                    p.marketplaceOrderId === selectedPayment.marketplaceOrderId
                        ? { ...p, matchStatus: 'linked' as const }
                        : p
                ),
            });
        }
        setShowManualLinkModal(false);
    };

    const handleEditTags = (payment: PreviewPayment) => {
        setSelectedPayment(payment);
        setShowEditTagsModal(true);
    };

    const handleSaveTags = async (
        updatedTags: string[],
        createRule: boolean,
        updatedType?: string,
        updatedDescription?: string,
        expenseCategory?: string,
        ruleId?: string | null,
        updateSelectedRule?: boolean,
        appliedRule?: AutoRule | null,
        ruleActionFlags?: { includeTags: boolean; includeType: boolean; includeCategory: boolean },
        ruleCondition?: { field: string; operator: string; value: string }
    ) => {
        if (!selectedPayment || !previewData) return;

        // Use the ORIGINAL description from the selected payment for pattern matching
        // This ensures we match similar entries even if user edited the description
        const originalDescription = selectedPayment.transactionDescription || '';

        // Build pattern for matching similar entries using original description
        const patternKeyword = originalDescription.length > 10
            ? originalDescription.substring(0, 30).toLowerCase()
            : originalDescription.toLowerCase();

        console.log('[ImportPage] Matching pattern:', patternKeyword);

        const shouldReplicate = createRule || !!updateSelectedRule;
        const conditionForPreview = ruleCondition?.value ? {
            id: `cond_preview_${Date.now()}`,
            field: ruleCondition.field,
            operator: ruleCondition.operator,
            value: ruleCondition.value,
        } : null;

        const normalizeField = (field: string) => {
            const normalized = field.trim().toLowerCase();
            if (normalized === 'transaction_type' || normalized === 'transactiontype') return 'type';
            if (normalized === 'descricao') return 'description';
            return normalized;
        };

        const buildPreviewRule = () => {
            if (!updateSelectedRule || !appliedRule) return null;
            const baseConditions = Array.isArray(appliedRule.conditions) ? appliedRule.conditions : [];
            if (!conditionForPreview) {
                return {
                    conditions: baseConditions,
                    logic: appliedRule.conditionLogic,
                };
            }

            const textFields = new Set(['description', 'type', 'full_text', 'order_id']);
            const shouldUseOr = baseConditions.length > 0 &&
                baseConditions.every((condition) => textFields.has(normalizeField(String(condition.field || '')))) &&
                textFields.has(normalizeField(String(conditionForPreview.field || '')));

            return {
                conditions: [...baseConditions, conditionForPreview],
                logic: shouldUseOr ? 'OR' : appliedRule.conditionLogic,
            };
        };

        const previewRule = buildPreviewRule();

        const matchesPreviewCondition = (payment: PreviewPayment) => {
            if (!shouldReplicate) return false;
            if (previewRule) {
                const paymentInput = {
                    marketplaceOrderId: payment.marketplaceOrderId,
                    transactionDescription: payment.transactionDescription || '',
                    transactionType: payment.transactionType || '',
                    amount: payment.netAmount,
                    paymentDate: payment.paymentDate || '',
                };
                return evaluateConditions(previewRule.conditions, paymentInput, previewRule.logic).matched;
            }
            if (createRule && patternKeyword) {
                const textToMatch = `${payment.transactionDescription || ''} ${payment.transactionType || ''}`.toLowerCase();
                return textToMatch.includes(patternKeyword);
            }
            return false;
        };

        // Update payments - if creating rule, apply to ALL matching entries
        const updatedPayments = previewData.payments.map(p => {
            // Always update the selected payment
            if (p.marketplaceOrderId === selectedPayment.marketplaceOrderId) {
                return {
                    ...p,
                    tags: updatedTags,
                    transactionType: updatedType || p.transactionType,
                    transactionDescription: updatedDescription || p.transactionDescription,
                    expenseCategory: expenseCategory || p.expenseCategory,
                    isExpense: expenseCategory ? true : p.isExpense,
                };
            }

            // Replicate edits to matching entries when rule is being created or updated
            if (matchesPreviewCondition(p)) {
                console.log('[ImportPage] ✓ Matched entry:', p.marketplaceOrderId, p.transactionDescription?.substring(0, 40));
                // Merge new tags with existing ones (avoid duplicates)
                const mergedTags = [...new Set([...p.tags, ...updatedTags])];
                return {
                    ...p,
                    tags: mergedTags,
                    // Also apply transactionType if provided
                    transactionType: updatedType || p.transactionType,
                    // Also apply expenseCategory if provided
                    expenseCategory: expenseCategory || p.expenseCategory,
                    // Mark as expense if category is set
                    isExpense: expenseCategory ? true : p.isExpense,
                };
            }

            return p;
        });

        // Count how many entries were affected (excluding the selected one)
        const otherMatchCount = shouldReplicate
            ? previewData.payments.filter(p => {
                if (p.marketplaceOrderId === selectedPayment.marketplaceOrderId) return false;
                return matchesPreviewCondition(p);
            }).length
            : 0;

        console.log('[ImportPage] Applied to:', otherMatchCount + 1, 'entries');

        // Log what we're about to update
        const updatedEntriesWithTags = updatedPayments.filter(p =>
            p.tags && p.tags.length > 0 && p.tags !== previewData.payments.find(op => op.marketplaceOrderId === p.marketplaceOrderId)?.tags
        );
        console.log('[ImportPage] Entries with new tags:', updatedEntriesWithTags.map(p => ({
            id: p.marketplaceOrderId,
            tags: p.tags,
        })));

        setPreviewData({ ...previewData, payments: updatedPayments });

        console.log('[ImportPage] State updated!');

        if (createRule && patternKeyword) {
            try {
                // Build actions array based on what was selected by user
                const actions: Array<{ type: string; tags?: string[]; transactionType?: string; category?: string }> = [];

                // Add tags action if selected
                if (ruleActionFlags?.includeTags && updatedTags.length > 0) {
                    actions.push({
                        type: 'add_tags',
                        tags: updatedTags,
                    });
                }

                // Add set_type action if selected
                if (ruleActionFlags?.includeType && updatedType) {
                    actions.push({
                        type: 'set_type',
                        transactionType: updatedType,
                    });
                }

                // Add set_category action if selected
                if (ruleActionFlags?.includeCategory && expenseCategory) {
                    actions.push({
                        type: 'set_category',
                        category: expenseCategory,
                    });
                }

                // Only create rule if there are actions
                if (actions.length === 0) {
                    console.log('[ImportPage] No actions to create rule for');
                    return;
                }

                // Create rule in new auto_rules table via new API
                // Use custom condition from UI if provided, otherwise fallback to auto-generated
                const conditionToUse = ruleCondition && ruleCondition.value
                    ? ruleCondition
                    : { field: 'full_text', operator: 'contains', value: patternKeyword };

                const response = await fetch('/api/financeiro/rules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: `Regra: ${originalDescription.substring(0, 30)}`,
                        description: `Criada automaticamente para: ${originalDescription}`,
                        marketplaces: DEFAULT_RULE_MARKETPLACES,
                        conditions: [{
                            id: `cond_${Date.now()}`,
                            field: conditionToUse.field,
                            operator: conditionToUse.operator,
                            value: conditionToUse.value,
                        }],
                        conditionLogic: 'AND',
                        actions: actions,
                        priority: 50,
                        enabled: true,
                        stopOnMatch: false,
                    }),
                });

                const result = await response.json();
                console.log('[ImportPage] Rule creation result:', result);

                if (!response.ok || !result.success) {
                    const conflictName = result?.conflict?.rule?.name;
                    const baseMessage = result?.error || 'Erro ao criar regra';
                    setRuleFeedback({
                        message: conflictName ? `⚠️ ${baseMessage} (${conflictName})` : `⚠️ ${baseMessage}`,
                        count: 0,
                    });
                    return;
                }

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

        if (ruleId && updateSelectedRule && ruleCondition?.value) {
            try {
                const rulesResponse = await fetch(`/api/financeiro/rules?marketplace=${marketplace}`);
                const rulesData = await rulesResponse.json();
                const targetRule = (rulesData.rules || []).find((r: AutoRule) => r.id === ruleId);

                if (!targetRule) {
                    console.warn('[ImportPage] Rule not found for update:', ruleId);
                } else if (targetRule.isSystemRule) {
                    console.warn('[ImportPage] Skip updating system rule:', ruleId);
                } else {
                    const normalizeText = (text: string) => text
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .trim();

                    const normalizeField = (field: string) => {
                        const normalized = field.trim().toLowerCase();
                        if (normalized === 'transaction_type' || normalized === 'transactiontype') return 'type';
                        if (normalized === 'descricao') return 'description';
                        return normalized;
                    };

                    const normalizeConditionValue = (value: string, operator: string) => {
                        if (operator === 'regex') return value.trim();
                        return normalizeText(value);
                    };

                    const buildConditionKey = (condition: { field: string; operator: string; value: string; value2?: string }) => {
                        return JSON.stringify({
                            field: normalizeField(condition.field),
                            operator: condition.operator,
                            value: normalizeConditionValue(condition.value, condition.operator),
                            value2: condition.value2 ? normalizeConditionValue(condition.value2, condition.operator) : undefined,
                        });
                    };

                    const newCondition = {
                        id: `cond_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                        field: normalizeField(ruleCondition.field),
                        operator: ruleCondition.operator,
                        value: ruleCondition.value,
                    };

                    const existingConditions = Array.isArray(targetRule.conditions) ? targetRule.conditions : [];
                    const existingKeys = new Set(existingConditions.map((condition) => buildConditionKey({
                        field: condition.field,
                        operator: condition.operator,
                        value: String(condition.value ?? ''),
                        value2: condition.value2 ? String(condition.value2) : undefined,
                    })));
                    const newKey = buildConditionKey({
                        field: newCondition.field,
                        operator: newCondition.operator,
                        value: String(newCondition.value),
                    });

                    if (!existingKeys.has(newKey)) {
                        const updatedConditions = [...existingConditions, newCondition];
                        const textFields = new Set(['description', 'type', 'full_text', 'order_id']);
                        const shouldUseOr = existingConditions.length > 0 &&
                            existingConditions.every((condition) => textFields.has(normalizeField(condition.field))) &&
                            textFields.has(normalizeField(newCondition.field));
                        const nextLogic = shouldUseOr ? 'OR' : targetRule.conditionLogic;

                        const updateResponse = await fetch('/api/financeiro/rules', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: targetRule.id,
                                conditions: updatedConditions,
                                conditionLogic: nextLogic,
                            }),
                        });

                        const updateData = await updateResponse.json();
                        if (!updateResponse.ok || !updateData.success) {
                            console.error('[ImportPage] Failed to update rule conditions:', updateData);
                            setRuleFeedback({
                                message: '⚠️ Não foi possível atualizar a regra selecionada',
                                count: 0,
                            });
                        } else {
                            setRuleFeedback({
                                message: '✅ Regra atualizada com nova condição',
                                count: 1,
                            });
                            setTimeout(() => setRuleFeedback(null), 3000);
                        }
                    }
                }
            } catch (error) {
                console.error('[ImportPage] Error updating rule conditions:', error);
            }
        }

        setShowEditTagsModal(false);
    };

    const handleForceSync = async (payment: PreviewPayment) => {
        if (!payment.marketplaceOrderId) return;

        try {
            console.log(`Syncing order ${payment.marketplaceOrderId}...`);
            await forceSyncOrder(payment.marketplaceOrderId, marketplace);

            // Re-run preview logic to refresh data locally if needed, 
            // or just assume revalidatePath handled it and trigger a re-render
            // Since preview data is state-based (previewData), we technically need to refresh it.
            // But revalidatePath only refreshes server components or data fetches.
            // Our preview data came from a file upload (POST). 
            // To update the *preview* table, we might need to re-fetch the 'link' info for this specific item?
            // Actually, simply re-running handlePreview() might be heavy if file is large.
            // A lighter way is to update the specific payment in state with new tinyOrderInfo.
            // For now, let's try just notifying. 
            // BUT: The user wants to see the data appear. 
            // The table displays `payment.tinyOrderInfo`. This comes from `preview/route.ts` which queried the DB.
            // If DB updated, we need to re-fetch that info.

            // Let's rely on re-running handlePreview for correctness, assuming file is in state `file`.
            if (file) {
                await handlePreview();
            } else {
                alert('Pedido sincronizado com Tiny! Por favor, re-importe o arquivo para ver os dados atualizados.');
            }

        } catch (error) {
            console.error('Error syncing order:', error);
            alert('Erro ao sincronizar pedido. Verifique o console.');
        }
    };

    const handleBulkApplyRules = (matches: { paymentId: string; rule: AutoRule }[], options?: { mode?: 'auto' | 'manual' }) => {
        if (!previewData) return;
        const mode = options?.mode ?? 'manual';

        const updatedPayments = previewData.payments.map(p => {
            const match = matches.find(m => m.paymentId === p.marketplaceOrderId);
            if (match) {
                const { rule } = match;
                const updatedP = { ...p };

                if (mode === 'auto' && !updatedP.autoRuleSnapshot) {
                    updatedP.autoRuleSnapshot = {
                        tags: [...(updatedP.tags || [])],
                        transactionType: updatedP.transactionType,
                        transactionDescription: updatedP.transactionDescription,
                        expenseCategory: updatedP.expenseCategory,
                        isExpense: updatedP.isExpense,
                        matchedRuleNames: updatedP.matchedRuleNames ? [...updatedP.matchedRuleNames] : [],
                    };
                }

                // Track applied rule
                const newMatchedRules = [...(updatedP.matchedRuleNames || [])];
                if (!newMatchedRules.includes(rule.name)) {
                    newMatchedRules.push(rule.name);
                }
                updatedP.matchedRuleNames = newMatchedRules;
                if (mode === 'auto') {
                    const autoApplied = new Set(updatedP.autoRuleAppliedNames || []);
                    autoApplied.add(rule.name);
                    updatedP.autoRuleAppliedNames = Array.from(autoApplied);
                    updatedP.autoRuleOptOut = false;
                }

                // Apply actions
                rule.actions.forEach(action => {
                    if (action.type === 'add_tags') {
                        const tagsToAdd = action.tags || [];
                        updatedP.tags = [...new Set([...(updatedP.tags || []), ...tagsToAdd])];
                    }
                    else if (action.type === 'set_type') {
                        if (action.transactionType) updatedP.transactionType = action.transactionType;
                    }
                    else if (action.type === 'set_category') {
                        if (action.category) {
                            updatedP.expenseCategory = action.category;
                            updatedP.isExpense = true;
                        }
                    }
                    else if (action.type === 'set_description') {
                        if (action.description) updatedP.transactionDescription = action.description;
                    }
                });

                return updatedP;
            }
            return p;
        });

        setPreviewData({ ...previewData, payments: updatedPayments });

        if (mode === 'manual') {
            setRuleFeedback({
                message: `✅ ${matches.length} regras aplicadas com sucesso`,
                count: matches.length
            });
            setTimeout(() => setRuleFeedback(null), 3000);
        }
    };

    const handleBulkRemoveRules = (paymentIds: string[]) => {
        if (!previewData) return;

        const updatedPayments = previewData.payments.map((payment) => {
            if (!paymentIds.includes(payment.marketplaceOrderId)) return payment;
            if (!payment.autoRuleSnapshot) {
                return {
                    ...payment,
                    autoRuleAppliedNames: [],
                    autoRuleOptOut: true,
                };
            }

            const snapshot = payment.autoRuleSnapshot;
            return {
                ...payment,
                tags: snapshot.tags,
                transactionType: snapshot.transactionType,
                transactionDescription: snapshot.transactionDescription,
                expenseCategory: snapshot.expenseCategory,
                isExpense: snapshot.isExpense,
                matchedRuleNames: snapshot.matchedRuleNames,
                autoRuleAppliedNames: [],
                autoRuleOptOut: true,
            };
        });

        setPreviewData({ ...previewData, payments: updatedPayments });
        setRuleFeedback({
            message: `↩️ ${paymentIds.length} regras automáticas removidas`,
            count: paymentIds.length
        });
        setTimeout(() => setRuleFeedback(null), 3000);
    };



    const handleStartOver = () => {
        setStep('upload');
        setFile(null);
        setPreviewData(null);
        setConfirmResult(null);
        setPendingEscrowOrders([]);
        setSyncCompleted(false);
        setSyncKey((k) => k + 1);
    };

    // Get unique unlinked orders for batch sync
    const unmatchedOrders = useMemo(() => {
        if (!previewData) return [];

        // Filter to only unlinked orders, get unique base IDs
        const seen = new Set<string>();
        return previewData.payments
            .filter(p => p.matchStatus === 'unmatched')
            .filter(p => {
                // Extract base order ID (remove suffixes)
                const baseId = p.marketplaceOrderId
                    .replace(/_(?:AJUSTE|REEMBOLSO|RETIRADA|FRETE|COMISSAO)(?:_?\d+)?$/i, '')
                    .replace(/_\d+$/, '');
                if (seen.has(baseId)) return false;
                seen.add(baseId);
                return true;
            })
            .map(p => ({
                marketplaceOrderId: p.marketplaceOrderId,
                marketplace: previewData.marketplace,
                syncType: 'link' as const,
            }));
    }, [previewData]);

    const syncOrders = useMemo(() => {
        if (!previewData) return [];
        const combined = [
            ...unmatchedOrders,
            ...(pendingEscrowOrders || []).map((id) => ({
                marketplaceOrderId: id,
                marketplace: previewData.marketplace,
                syncType: 'escrow' as const,
            })),
        ];
        const byBaseId = new Map<string, typeof combined[number]>();
        for (const order of combined) {
            const baseId = order.marketplaceOrderId
                .replace(/_(?:AJUSTE|REEMBOLSO|RETIRADA|FRETE|COMISSAO)(?:_?\d+)?$/i, '')
                .replace(/_\d+$/, '');
            if (!baseId) continue;
            const existing = byBaseId.get(baseId);
            if (!existing || (existing.syncType === 'escrow' && order.syncType === 'link')) {
                byBaseId.set(baseId, order);
            }
        }
        return Array.from(byBaseId.values());
    }, [previewData, unmatchedOrders, pendingEscrowOrders]);

    const handleSyncComplete = async () => {
        console.log('[ImportarPagamentos] Sync complete, refreshing preview...');
        // Mark sync as completed to prevent loop
        setSyncCompleted(true);
        // Re-run preview to refresh the data
        if (file) {
            await handlePreview();
            console.log('[ImportarPagamentos] Preview refresh complete');
        } else {
            console.warn('[ImportarPagamentos] No file available for preview refresh');
        }
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

                                    {/* Auto-Sync Banner - only show if sync hasn't completed yet */}
                                    {!syncCompleted && syncOrders.length > 0 && (
                                        <SyncBanner
                                            key={syncKey}
                                            orders={syncOrders}
                                            onComplete={handleSyncComplete}
                                            autoStart={true}
                                        />
                                    )}

                                    <PaymentPreviewTable
                                        payments={previewData.payments}
                                        marketplace={previewData.marketplace}
                                        onManualLink={handleManualLink}
                                        onEditTags={handleEditTags}
                                        onForceSync={handleForceSync}
                                        onBulkApplyRules={handleBulkApplyRules}
                                        onBulkRemoveRules={handleBulkRemoveRules}
                                        autoApplyEnabled={!previewData.rulesAppliedBackend}
                                    />
                                </div>

                                {/* Actions */}
                                <div className="flex items-center justify-between flex-wrap gap-4">
                                    <button
                                        onClick={handleStartOver}
                                        className="app-btn-secondary inline-flex items-center gap-2"
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                        Cancelar
                                    </button>

                                    <div className="flex items-center gap-3">
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
                                    amount: selectedPayment.netAmount,
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
        </AppLayout >
    );
}
