'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Save, Tag as TagIcon, Sparkles } from 'lucide-react';

interface EditTagsModalProps {
    isOpen: boolean;
    onClose: () => void;
    payment: {
        marketplaceOrderId: string;
        transactionDescription?: string;
        transactionType?: string;
        tags: string[];
        isExpense?: boolean;
        expenseCategory?: string;
    };
    marketplace: string;
    onSave: (updatedTags: string[], createRule: boolean, updatedType?: string, updatedDescription?: string, expenseCategory?: string) => void;
}

export default function EditTagsModal({
    isOpen,
    onClose,
    payment,
    marketplace,
    onSave,
}: EditTagsModalProps) {
    const [tags, setTags] = useState<string[]>(payment.tags || []);
    const [newTag, setNewTag] = useState('');
    const [transactionType, setTransactionType] = useState(payment.transactionType || '');
    const [transactionDescription, setTransactionDescription] = useState(payment.transactionDescription || '');
    const [expenseCategory, setExpenseCategory] = useState(payment.expenseCategory || '');
    const [createAutoRule, setCreateAutoRule] = useState(false);

    // Handle ESC key to close modal
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleAddTag = () => {
        if (newTag && !tags.includes(newTag)) {
            setTags([...tags, newTag]);
            setNewTag('');
        }
    };

    const handleRemoveTag = (tagToRemove: string) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    const handleSave = () => {
        onSave(tags, createAutoRule, transactionType, transactionDescription, expenseCategory);
        onClose();
    };

    // Suggested tags based on description
    const suggestedTags = [
        'reembolso',
        'ajuste',
        'taxa',
        'frete',
        'anuncio',
        'marketing',
        'retirada',
        'comissao',
    ].filter(tag => !tags.includes(tag));

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/10 dark:bg-black/60 backdrop-blur-xl"
            onClick={onClose}
        >
            <div
                className="glass-card glass-tint max-w-3xl w-full rounded-3xl shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="relative border-b border-white/10 dark:border-white/5 px-8 py-6 bg-gradient-to-br from-white/5 to-transparent">
                    <div className="flex items-start justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                                Editar Transação
                            </h2>
                            <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                                Pedido: {payment.marketplaceOrderId}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-full hover:bg-white/10 dark:hover:bg-white/5 transition-all duration-200 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="px-8 py-6 space-y-6 max-h-[70vh] overflow-y-auto">
                    {/* Transaction Info - Editable */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Tipo de Transação
                            </label>
                            <input
                                type="text"
                                value={transactionType}
                                onChange={(e) => setTransactionType(e.target.value)}
                                placeholder="Ex: Renda de pedido, Taxa de publicidade..."
                                className="app-input w-full"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Descrição da Transação
                            </label>
                            <textarea
                                value={transactionDescription}
                                onChange={(e) => setTransactionDescription(e.target.value)}
                                placeholder="Ex: Recarga de Anúncios, Ajuste de valor..."
                                rows={3}
                                className="app-input w-full resize-none"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1.5">
                                <span>💡</span>
                                <span>Edite para padronizar. Regras automáticas usarão este texto.</span>
                            </p>
                        </div>

                        {/* Expense Category */}
                        {payment.isExpense && (
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    Categoria de Despesa
                                </label>
                                <select
                                    value={expenseCategory}
                                    onChange={(e) => setExpenseCategory(e.target.value)}
                                    className="app-input w-full cursor-pointer"
                                >
                                    <option value="">Selecione uma categoria...</option>
                                    <option value="anuncios">📢 Anúncios / Publicidade</option>
                                    <option value="taxas">💳 Taxas / Tarifas</option>
                                    <option value="comissao">💰 Comissão</option>
                                    <option value="frete">📦 Frete</option>
                                    <option value="reembolso">↩️ Reembolso</option>
                                    <option value="ajuste">⚖️ Ajuste</option>
                                    <option value="saque">🏦 Saque / Retirada</option>
                                    <option value="outros">📋 Outros</option>
                                </select>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1.5">
                                    <span>💡</span>
                                    <span>Categorize para melhor controle de despesas</span>
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-700 to-transparent"></div>

                    {/* Tags Management */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                            Tags
                        </label>
                        <div className="glass-card p-3 rounded-2xl min-h-[80px] flex flex-wrap gap-2 items-start border border-gray-200 dark:border-gray-700 focus-within:border-blue-500 dark:focus-within:border-blue-400 transition-all">
                            {/* Current Tags */}
                            {tags.map(tag => (
                                <span
                                    key={tag}
                                    className="group inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 dark:bg-blue-400/10 border border-blue-500/20 dark:border-blue-400/20 text-blue-700 dark:text-blue-400 rounded-full text-sm font-medium hover:bg-blue-500/20 dark:hover:bg-blue-400/20 transition-all cursor-pointer"
                                >
                                    <TagIcon className="w-3.5 h-3.5" />
                                    {tag}
                                    <button
                                        onClick={() => handleRemoveTag(tag)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 -mr-1 p-0.5 rounded-full hover:bg-red-100/50 dark:hover:bg-red-900/20"
                                        title="Remover tag"
                                    >
                                        <X className="w-3.5 h-3.5 hover:text-red-600 dark:hover:text-red-400" />
                                    </button>
                                </span>
                            ))}

                            {/* Input for new tag */}
                            <input
                                type="text"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddTag();
                                    }
                                }}
                                placeholder={tags.length === 0 ? "Digite para adicionar tags..." : "Adicionar mais..."}
                                className="flex-1 min-w-[200px] bg-transparent border-none outline-none text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 px-2 py-1.5"
                            />
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1.5">
                            <span>💡</span>
                            <span>Digite e pressione Enter para adicionar. Passe o mouse sobre as tags para remover.</span>
                        </p>
                    </div>

                    {/* Suggested Tags */}
                    {suggestedTags.length > 0 && (
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                                Tags Sugeridas
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {suggestedTags.map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => setTags([...tags, tag])}
                                        className="px-4 py-2 glass-card rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-white/20 dark:hover:bg-white/5 transition-all border border-white/10 dark:border-white/5"
                                    >
                                        + {tag}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-700 to-transparent"></div>

                    {/* Create Auto-Rule */}
                    <div className="glass-card p-5 rounded-2xl border border-purple-500/20 dark:border-purple-400/20">
                        <label className="flex items-start gap-4 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={createAutoRule}
                                onChange={(e) => setCreateAutoRule(e.target.checked)}
                                className="mt-1 w-5 h-5 text-purple-600 rounded focus:ring-2 focus:ring-purple-500 focus:ring-offset-0 border-gray-300 dark:border-gray-600 cursor-pointer"
                            />
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <Sparkles className="w-5 h-5 text-purple-500 dark:text-purple-400" />
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                        Criar regra automática
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                                    Aplicar estas tags automaticamente em futuras importações com descrição semelhante
                                </p>
                            </div>
                        </label>
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-white/10 dark:border-white/5 px-8 py-5 flex justify-end gap-3 bg-gradient-to-br from-transparent to-white/5">
                    <button
                        onClick={onClose}
                        className="app-btn-secondary px-6 py-2.5"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        className="app-btn-primary px-6 py-2.5 inline-flex items-center gap-2"
                    >
                        <Save className="w-4 h-4" />
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
}
