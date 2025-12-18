'use client';

import { useState } from 'react';
import {
    Plus, ChevronDown, FileText, Repeat, CreditCard,
    Upload, University, Tag
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';

// Import modals to control them
import { ManualEntryModal } from './ManualEntryModal';
import { InstallmentModal } from './InstallmentModal';
import { RecurringEntriesModal } from './RecurringEntriesModal';
import { BankReconciliationModal } from './BankReconciliationModal';
import { TagsManagerModal } from './TagsManagerModal';

export function ActionsDropdown() {
    // We need to control modal states from here or pass triggers
    // Since modals usually have their own triggers, we might need to adjust them 
    // to accept an "open" prop or expose a trigger component we can wrap.
    // However, the easiest way with existing modals that have <DialogTrigger> 
    // is to render them but hidden, and trigger their click or use state lifting.

    // Better approach: Refactor modals to accept `open` and `onOpenChange` props, 
    // but that requires changing all 4 modals.

    // Alternative: Render the modals' triggers as generic buttons inside the dropdown items.
    // But DropdownMenuItem suppresses clicks sometimes if not handled right.

    // Let's use a simpler approach: The Dropdown acts as the UI, 
    // and selecting an item sets a state that opens the corresponding modal.

    const [modalOpen, setModalOpen] = useState<{
        manual: boolean;
        installment: boolean;
        recurring: boolean;
        reconciliation: boolean;
        tags: boolean;
    }>({
        manual: false,
        installment: false,
        recurring: false,
        reconciliation: false,
        tags: false,
    });

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className="app-btn-primary flex items-center gap-2 pl-3 pr-4 shadow-lg shadow-primary-500/20">
                        <Plus className="w-5 h-5" />
                        <span className="font-medium">Nova Operação</span>
                        <ChevronDown className="w-4 h-4 opacity-50 ml-1" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl">
                    <DropdownMenuLabel className="text-xs text-slate-400 font-normal px-2 py-1.5 uppercase tracking-wider">
                        Lançamentos
                    </DropdownMenuLabel>

                    <DropdownMenuItem
                        onClick={() => setModalOpen(p => ({ ...p, manual: true }))}
                        className="flex items-center gap-2 p-2 rounded-lg cursor-pointer focus:bg-primary-50 dark:focus:bg-primary-900/20 focus:text-primary-600"
                    >
                        <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center text-primary-600">
                            <Plus className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-medium text-sm">Novo Lançamento</span>
                            <span className="text-[10px] text-slate-400">Receita ou Despesa</span>
                        </div>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                        onClick={() => setModalOpen(p => ({ ...p, installment: true }))}
                        className="flex items-center gap-2 p-2 rounded-lg cursor-pointer focus:bg-purple-50 dark:focus:bg-purple-900/20 focus:text-purple-600 mt-1"
                    >
                        <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-purple-600">
                            <CreditCard className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-medium text-sm">Parcelamento</span>
                            <span className="text-[10px] text-slate-400">Dividir em parcelas</span>
                        </div>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                        onClick={() => setModalOpen(p => ({ ...p, recurring: true }))}
                        className="flex items-center gap-2 p-2 rounded-lg cursor-pointer focus:bg-blue-50 dark:focus:bg-blue-900/20 focus:text-blue-600 mt-1"
                    >
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600">
                            <Repeat className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-medium text-sm">Recorrência</span>
                            <span className="text-[10px] text-slate-400">Mensal, semanal...</span>
                        </div>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator className="my-2 bg-slate-100 dark:bg-slate-800" />

                    <DropdownMenuLabel className="text-xs text-slate-400 font-normal px-2 py-1.5 uppercase tracking-wider">
                        Ferramentas
                    </DropdownMenuLabel>

                    <DropdownMenuItem
                        onClick={() => setModalOpen(p => ({ ...p, reconciliation: true }))}
                        className="flex items-center gap-2 p-2 rounded-lg cursor-pointer focus:bg-amber-50 dark:focus:bg-amber-900/20 focus:text-amber-600"
                    >
                        <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600">
                            <University className="w-4 h-4" />
                        </div>
                        <span className="font-medium text-sm">Conciliação Bancária</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                        onClick={() => setModalOpen(p => ({ ...p, tags: true }))}
                        className="flex items-center gap-2 p-2 rounded-lg cursor-pointer focus:bg-indigo-50 dark:focus:bg-indigo-900/20 focus:text-indigo-600"
                    >
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600">
                            <Tag className="w-4 h-4" />
                        </div>
                        <span className="font-medium text-sm">Gerenciar Tags</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem asChild>
                        <Link
                            href="/financeiro/importar-pagamentos"
                            className="flex items-center gap-2 p-2 rounded-lg cursor-pointer focus:bg-emerald-50 dark:focus:bg-emerald-900/20 focus:text-emerald-600 mt-1 w-full"
                        >
                            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600">
                                <Upload className="w-4 h-4" />
                            </div>
                            <span className="font-medium text-sm">Importar Arquivo</span>
                        </Link>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Hidden Modals controlled by state */}
            {/* Note: Modals need to support external control prop 'open' and 'onOpenChange' 
                If they don't, we need to wrap them or trust they have default open handling.
                Assuming standard Dialog accessible via triggering click on hidden standard trigger 
                OR modifying them to accept open prop.
                
                For now, let's look at ManualEntryModal and others to see if they accept props.
                If not, we will need to update them.
            */}

            {/* Temporary solution if modals don't support props: Render them and use a ref to click trigger? 
                No, clean way is to make them accept 'open' state. 
                Checking previous edits: InstallmentModal has internal state [open, setOpen].
            */}

            <ManualEntryModal
                open={modalOpen.manual}
                onOpenChange={(v) => setModalOpen(p => ({ ...p, manual: v }))}
            />

            <InstallmentModal
                open={modalOpen.installment}
                onOpenChange={(v) => setModalOpen(p => ({ ...p, installment: v }))}
            />

            <RecurringEntriesModal
                open={modalOpen.recurring}
                onOpenChange={(v) => setModalOpen(p => ({ ...p, recurring: v }))}
            />

            <BankReconciliationModal
                open={modalOpen.reconciliation}
                onOpenChange={(v) => setModalOpen(p => ({ ...p, reconciliation: v }))}
            />

            <TagsManagerModal
                open={modalOpen.tags}
                onOpenChange={(v) => setModalOpen(p => ({ ...p, tags: v }))}
            />
        </>
    );
}
