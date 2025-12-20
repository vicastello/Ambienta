'use client';

interface MarketplaceTabsProps {
    activeTab: 'shopee' | 'mercadoLivre' | 'magalu';
    onTabChange: (tab: 'shopee' | 'mercadoLivre' | 'magalu') => void;
}

const TABS = [
    { id: 'shopee' as const, name: 'Shopee', color: '#ee4d2d' },
    { id: 'mercadoLivre' as const, name: 'Mercado Livre', color: '#ffe600' },
    { id: 'magalu' as const, name: 'Magalu', color: '#0086ff' },
];

export function MarketplaceTabs({ activeTab, onTabChange }: MarketplaceTabsProps) {
    return (
        <div className="flex gap-2 p-1 rounded-[20px] glass-panel glass-tint border border-white/40 dark:border-white/10 w-fit">
            {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        className={`
              flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all
              ${isActive
                                ? 'rounded-2xl bg-white/80 dark:bg-white/15 shadow-sm text-main'
                                : 'text-muted hover:text-main !bg-transparent !border-0 !shadow-none hover:!bg-transparent'
                            }
            `}
                    >
                        <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: tab.color }}
                        />
                        <span>{tab.name}</span>
                    </button>
                );
            })}
        </div>
    );
}
