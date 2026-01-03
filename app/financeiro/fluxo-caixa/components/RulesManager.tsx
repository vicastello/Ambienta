'use client';

import { useState, useCallback } from 'react';
import RulesList from './RulesList';
import RuleEditor from './RuleEditor';
import ReprocessPanel from './ReprocessPanel';
import RuleTemplateSelector from './RuleTemplateSelector';
import RuleAnomalyAlerts from './RuleAnomalyAlerts';
import type { AutoRule, CreateRulePayload } from '@/lib/rules';

interface RulesManagerProps {
    className?: string;
}

export default function RulesManager({ className }: RulesManagerProps) {
    const [editingRule, setEditingRule] = useState<AutoRule | null>(null);
    const [showEditor, setShowEditor] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    const [templatePayload, setTemplatePayload] = useState<CreateRulePayload | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const handleCreateNew = useCallback(() => {
        setEditingRule(null);
        setTemplatePayload(null);
        setShowTemplates(true);  // Show template selector first
    }, []);

    const handleStartFromScratch = useCallback(() => {
        setShowTemplates(false);
        setShowEditor(true);
    }, []);

    const handleSelectTemplate = useCallback((payload: CreateRulePayload) => {
        setTemplatePayload(payload);
        setShowTemplates(false);
        setShowEditor(true);
    }, []);

    const handleEdit = useCallback((rule: AutoRule) => {
        setEditingRule(rule);
        setTemplatePayload(null);
        setShowTemplates(false);
        setShowEditor(true);
    }, []);

    const handleSave = useCallback(async (ruleData: CreateRulePayload) => {
        const isEditing = editingRule !== null;
        const method = isEditing ? 'PATCH' : 'POST';
        const body = isEditing
            ? { id: editingRule.id, ...ruleData }
            : ruleData;

        const res = await fetch('/api/financeiro/rules', {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        const data = await res.json();

        if (!data.success) {
            throw new Error(data.error || 'Erro ao salvar');
        }

        setShowEditor(false);
        setEditingRule(null);
        setTemplatePayload(null);
        setRefreshTrigger(prev => prev + 1);
    }, [editingRule]);

    const handleCancel = useCallback(() => {
        setShowEditor(false);
        setShowTemplates(false);
        setEditingRule(null);
        setTemplatePayload(null);
    }, []);

    return (
        <div className={className}>
            <RulesList
                onEdit={handleEdit}
                onCreateNew={handleCreateNew}
                refreshTrigger={refreshTrigger}
            />

            {/* Template Selector Modal */}
            {showTemplates && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6">
                        <RuleTemplateSelector
                            onSelectTemplate={handleSelectTemplate}
                        />
                        <div className="mt-6 flex justify-between border-t border-gray-200 dark:border-gray-700 pt-4">
                            <button
                                onClick={handleStartFromScratch}
                                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                            >
                                Começar do zero
                            </button>
                            <button
                                onClick={handleCancel}
                                className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showEditor && (
                <RuleEditor
                    rule={editingRule || undefined}
                    initialPayload={templatePayload || undefined}
                    onSave={handleSave}
                    onCancel={handleCancel}
                />
            )}

            {/* Anomaly Alerts */}
            <div className="mt-6">
                <RuleAnomalyAlerts />
            </div>

            {/* Reprocess Historical Payments */}
            <div className="mt-6">
                <ReprocessPanel onComplete={() => setRefreshTrigger(prev => prev + 1)} />
            </div>
        </div>
    );
}

