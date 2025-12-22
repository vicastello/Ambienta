'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Search, Plus, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTagColor, formatTagName } from '@/lib/tagColors';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';

interface TagModalProps {
    isOpen: boolean;
    onClose: () => void;
    orderId: number;
    currentTags: string[];
    availableTags: { name: string; color?: string }[];
    onAddTag: (orderId: number, tag: string) => void;
    onRemoveTag: (orderId: number, tag: string) => void;
}

export default function TagModal({
    isOpen,
    onClose,
    orderId,
    currentTags,
    availableTags,
    onAddTag,
    onRemoveTag,
}: TagModalProps) {
    const [searchValue, setSearchValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when modal opens
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Reset search when modal closes
    useEffect(() => {
        if (!isOpen) {
            setSearchValue('');
        }
    }, [isOpen]);

    // Filter available tags based on search
    const filteredTags = useMemo(() => {
        const search = searchValue.toLowerCase().trim();
        if (!search) return availableTags;
        return availableTags.filter(tag =>
            tag.name.toLowerCase().includes(search)
        );
    }, [searchValue, availableTags]);

    // Check if current search matches any existing tag
    const isNewTag = useMemo(() => {
        const search = searchValue.trim().toLowerCase();
        if (!search) return false;
        return !availableTags.some(t => t.name.toLowerCase() === search);
    }, [searchValue, availableTags]);

    // Handle input change - check for comma to save tag
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;

        // Check if user typed a comma
        if (value.includes(',')) {
            const parts = value.split(',');
            parts.forEach((part, idx) => {
                const trimmed = part.trim();
                if (trimmed && idx < parts.length - 1) {
                    // Add tag for each part before the last comma
                    if (!currentTags.includes(trimmed)) {
                        onAddTag(orderId, trimmed);
                    }
                }
            });
            // Keep only the part after the last comma
            setSearchValue(parts[parts.length - 1]);
        } else {
            setSearchValue(value);
        }
    };

    // Handle Enter key
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const trimmed = searchValue.trim();
            if (trimmed && !currentTags.includes(trimmed)) {
                onAddTag(orderId, trimmed);
                setSearchValue('');
            }
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    // Add tag from suggestion
    const handleSelectTag = (tag: string) => {
        if (!currentTags.includes(tag)) {
            onAddTag(orderId, tag);
        }
        setSearchValue('');
        inputRef.current?.focus();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-md w-full p-0 gap-0 rounded-[24px] glass-panel glass-tint border border-white/10 shadow-2xl overflow-hidden !bg-white/95 dark:!bg-slate-900/95">
                <DialogHeader className="p-5 pb-3 border-b border-white/10">
                    <DialogTitle className="text-lg font-semibold text-main flex items-center gap-2">
                        <Tag className="w-5 h-5 text-primary-500" />
                        Gerenciar Tags
                    </DialogTitle>
                </DialogHeader>

                <div className="p-5 space-y-4">
                    {/* Tag Input with chips inside */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted uppercase tracking-wider">
                            Tags do pedido
                        </label>
                        {/* Chip input container */}
                        <div
                            className="flex flex-wrap items-center gap-2 p-2 min-h-[52px] rounded-xl bg-white/60 dark:bg-white/5 border border-white/20 dark:border-white/10 focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:border-primary-500/50 transition-all cursor-text"
                            onClick={() => inputRef.current?.focus()}
                        >
                            {/* Current tag chips */}
                            {currentTags.map((tag, idx) => {
                                const colors = getTagColor(tag);
                                return (
                                    <span
                                        key={idx}
                                        className={cn(
                                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-medium",
                                            colors.bg, colors.text
                                        )}
                                    >
                                        {formatTagName(tag)}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onRemoveTag(orderId, tag);
                                            }}
                                            className="hover:opacity-70 rounded-full p-0.5 transition-colors"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                );
                            })}
                            {/* Text input */}
                            <input
                                ref={inputRef}
                                type="text"
                                value={searchValue}
                                onChange={handleInputChange}
                                onKeyDown={handleKeyDown}
                                placeholder={currentTags.length === 0 ? "Digite uma tag..." : "Adicionar..."}
                                className="flex-1 min-w-[100px] px-1 py-1 bg-transparent text-main placeholder:text-muted focus:outline-none text-sm"
                            />
                        </div>
                        <p className="text-[11px] text-muted">
                            Pressione <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 font-mono">Enter</kbd> ou use <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10 font-mono">,</kbd> para adicionar
                        </p>
                    </div>

                    {/* Available Tags / Suggestions */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted uppercase tracking-wider">
                            {searchValue ? 'Sugestões' : 'Tags disponíveis'}
                        </label>
                        <div className="max-h-[200px] overflow-y-auto rounded-xl bg-white/40 dark:bg-white/5 border border-white/10 p-2">
                            {filteredTags.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                    {filteredTags.map((tag, idx) => {
                                        const isActive = currentTags.includes(tag.name);
                                        const colors = getTagColor(tag.name);
                                        return (
                                            <button
                                                key={idx}
                                                onClick={() => handleSelectTag(tag.name)}
                                                disabled={isActive}
                                                className={cn(
                                                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                                                    colors.bg, colors.text,
                                                    isActive ? "opacity-60 cursor-default" : "hover:opacity-80"
                                                )}
                                            >
                                                {isActive && <span>✓</span>}
                                                {formatTagName(tag.name)}
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : searchValue ? (
                                <div className="py-4 text-center">
                                    <p className="text-sm text-muted mb-2">Nenhuma tag encontrada</p>
                                    {isNewTag && (
                                        <button
                                            onClick={() => handleSelectTag(searchValue.trim())}
                                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 transition-colors"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Criar "{searchValue.trim()}"
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <p className="py-4 text-center text-sm text-muted">
                                    Nenhuma tag cadastrada ainda
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 pt-3 border-t border-white/10 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-full text-sm font-medium bg-white/60 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 text-main border border-white/20 transition-all"
                    >
                        Fechar
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
