'use client';

import { useState, useCallback } from 'react';
import RulesList from './RulesList';
import RuleEditor from './RuleEditor';
import type { AutoRule, CreateRulePayload } from '@/lib/rules';

interface RulesManagerProps {
    className?: string;
}

export default function RulesManager({ className }: RulesManagerProps) {
    const [editingRule, setEditingRule] = useState<AutoRule | null>(null);
    const [showEditor, setShowEditor] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const handleCreateNew = useCallback(() => {
        setEditingRule(null);
        setShowEditor(true);
    }, []);

    const handleEdit = useCallback((rule: AutoRule) => {
        setEditingRule(rule);
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
        setRefreshTrigger(prev => prev + 1);
    }, [editingRule]);

    const handleCancel = useCallback(() => {
        setShowEditor(false);
        setEditingRule(null);
    }, []);

    return (
        <div className={className}>
            <RulesList
                onEdit={handleEdit}
                onCreateNew={handleCreateNew}
                refreshTrigger={refreshTrigger}
            />

            {showEditor && (
                <RuleEditor
                    rule={editingRule || undefined}
                    onSave={handleSave}
                    onCancel={handleCancel}
                />
            )}
        </div>
    );
}
