'use client';

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { Tag, Plus, Trash2, Loader2, Edit2, Check, X, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface AvailableTag {
    id: string;
    name: string;
    color: string;
    usage_count: number;
}

const TAG_COLORS = [
    '#6366f1', // Indigo
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#ef4444', // Red
    '#f97316', // Orange
    '#eab308', // Yellow
    '#22c55e', // Green
    '#14b8a6', // Teal
    '#06b6d4', // Cyan
    '#3b82f6', // Blue
    '#64748b', // Slate
];

interface TagsManagerModalProps {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export function TagsManagerModal({ open: externalOpen, onOpenChange: externalOnOpenChange }: TagsManagerModalProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
    const setIsOpen = externalOnOpenChange || setInternalOpen;

    const [tags, setTags] = useState<AvailableTag[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form state
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState('');

    const fetchTags = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/financeiro/tags');
            const data = await res.json();
            setTags(data.tags || []);
        } catch (error) {
            console.error('Error fetching tags:', error);
            toast.error('Erro ao carregar tags');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchTags();
        }
    }, [isOpen, fetchTags]);

    const handleCreate = async () => {
        if (!newTagName.trim()) return;

        setCreating(true);
        try {
            const res = await fetch('/api/financeiro/tags/manage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newTagName.trim(), color: newTagColor })
            });

            if (!res.ok) throw new Error('Failed to create tag');

            toast.success('Tag criada com sucesso');
            setNewTagName('');
            setNewTagColor(TAG_COLORS[0]);
            fetchTags();
        } catch (error) {
            console.error('Error creating tag:', error);
            toast.error('Erro ao criar tag');
        } finally {
            setCreating(false);
        }
    };

    const handleUpdate = async (id: string) => {
        if (!editName.trim()) return;

        try {
            const res = await fetch('/api/financeiro/tags/manage', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name: editName.trim(), color: editColor })
            });

            if (!res.ok) throw new Error('Failed to update tag');

            toast.success('Tag atualizada');
            setEditingId(null);
            fetchTags();
        } catch (error) {
            console.error('Error updating tag:', error);
            toast.error('Erro ao atualizar tag');
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Excluir a tag "${name}"? Ela será removida de todos os pedidos.`)) return;

        try {
            const res = await fetch(`/api/financeiro/tags/manage?id=${id}`, {
                method: 'DELETE'
            });

            if (!res.ok) throw new Error('Failed to delete tag');

            toast.success('Tag excluída');
            fetchTags();
        } catch (error) {
            console.error('Error deleting tag:', error);
            toast.error('Erro ao excluir tag');
        }
    };

    const startEdit = (tag: AvailableTag) => {
        setEditingId(tag.id);
        setEditName(tag.name);
        setEditColor(tag.color);
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <button className="app-btn-secondary gap-2">
                    <Tag className="w-4 h-4" />
                    Gerenciar Tags
                </button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Tag className="w-5 h-5 text-primary-500" />
                        Gerenciar Tags
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 mt-4">
                    {/* Create New Tag */}
                    <div className="p-4 rounded-xl glass-panel border border-white/20 space-y-3">
                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">
                            Nova Tag
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                className="app-input flex-1"
                                placeholder="Nome da tag..."
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            />
                            <button
                                onClick={handleCreate}
                                disabled={creating || !newTagName.trim()}
                                className="app-btn-primary px-3"
                            >
                                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            </button>
                        </div>
                        {/* Color Picker */}
                        <div className="flex gap-1.5 flex-wrap">
                            {TAG_COLORS.map((color) => (
                                <button
                                    key={color}
                                    onClick={() => setNewTagColor(color)}
                                    className={cn(
                                        "w-6 h-6 rounded-full transition-all",
                                        newTagColor === color && "ring-2 ring-offset-2 ring-primary-500"
                                    )}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Tags List */}
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                            </div>
                        ) : tags.length === 0 ? (
                            <div className="text-center py-8 text-slate-400">
                                Nenhuma tag criada ainda
                            </div>
                        ) : (
                            tags.map((tag) => (
                                <div
                                    key={tag.id}
                                    className="flex items-center gap-3 p-3 rounded-xl glass-panel border border-white/20 group"
                                >
                                    {editingId === tag.id ? (
                                        <>
                                            <div
                                                className="w-4 h-4 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: editColor }}
                                            />
                                            <input
                                                type="text"
                                                className="app-input flex-1 text-sm py-1"
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                autoFocus
                                            />
                                            <div className="flex gap-1">
                                                {TAG_COLORS.slice(0, 5).map((color) => (
                                                    <button
                                                        key={color}
                                                        onClick={() => setEditColor(color)}
                                                        className={cn(
                                                            "w-4 h-4 rounded-full",
                                                            editColor === color && "ring-1 ring-white"
                                                        )}
                                                        style={{ backgroundColor: color }}
                                                    />
                                                ))}
                                            </div>
                                            <button
                                                onClick={() => handleUpdate(tag.id)}
                                                className="p-1 rounded hover:bg-emerald-500/20 text-emerald-500"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setEditingId(null)}
                                                className="p-1 rounded hover:bg-slate-500/20 text-slate-400"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <div
                                                className="w-4 h-4 rounded-full flex-shrink-0"
                                                style={{ backgroundColor: tag.color }}
                                            />
                                            <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
                                                {tag.name}
                                            </span>
                                            <span className="text-xs text-slate-400">
                                                {tag.usage_count} uso{tag.usage_count !== 1 ? 's' : ''}
                                            </span>
                                            <button
                                                onClick={() => startEdit(tag)}
                                                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-500/20 text-slate-400 transition-opacity"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(tag.id, tag.name)}
                                                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 text-rose-500 transition-opacity"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
