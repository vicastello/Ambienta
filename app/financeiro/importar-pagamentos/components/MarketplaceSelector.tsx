'use client';

import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

export type Marketplace = 'magalu' | 'mercado_livre' | 'shopee';

export interface MarketplaceConfig {
    id: Marketplace;
    name: string;
    logo: string;
    format: string;
    acceptedTypes: string;
}

export const MARKETPLACE_CONFIGS: MarketplaceConfig[] = [
    {
        id: 'shopee',
        name: 'Shopee',
        logo: '/logos/marketplaces/shopee.svg',
        format: 'XLSX',
        acceptedTypes: '.xlsx',
    },
    {
        id: 'magalu',
        name: 'Magalu',
        logo: '/logos/marketplaces/magalu.svg',
        format: 'CSV',
        acceptedTypes: '.csv',
    },
    {
        id: 'mercado_livre',
        name: 'Mercado Livre',
        logo: '/logos/marketplaces/mercadolivre.svg',
        format: 'XLSX',
        acceptedTypes: '.xlsx',
    },
];

export interface MarketplaceSelectorProps {
    /** Currently selected marketplace */
    selected: Marketplace;
    /** Callback when marketplace is selected */
    onSelect: (marketplace: Marketplace) => void;
    /** Whether the selector is disabled */
    disabled?: boolean;
    /** Additional class names */
    className?: string;
}

export function MarketplaceSelector({
    selected,
    onSelect,
    disabled = false,
    className,
}: MarketplaceSelectorProps) {
    return (
        <div className={cn('marketplace-grid', className)}>
            {MARKETPLACE_CONFIGS.map((marketplace) => (
                <button
                    key={marketplace.id}
                    type="button"
                    onClick={() => !disabled && onSelect(marketplace.id)}
                    disabled={disabled}
                    className={cn(
                        'marketplace-card',
                        selected === marketplace.id && 'marketplace-card-selected',
                        disabled && 'opacity-50 cursor-not-allowed'
                    )}
                >
                    <div className="marketplace-logo relative">
                        <Image
                            src={marketplace.logo}
                            alt={`${marketplace.name} logo`}
                            width={48}
                            height={48}
                            className="object-contain"
                        />
                    </div>
                    <span className="marketplace-name">{marketplace.name}</span>
                    <span className="marketplace-format">{marketplace.format}</span>
                </button>
            ))}
        </div>
    );
}

/** Helper to get marketplace config by ID */
export function getMarketplaceConfig(id: Marketplace): MarketplaceConfig | undefined {
    return MARKETPLACE_CONFIGS.find(m => m.id === id);
}

export default MarketplaceSelector;
