import jsPDF from 'jspdf';

export interface ExportOptions {
    format: 'json' | 'csv' | 'pdf';
    marketplaces?: string[]; // null = all
    includeCampaigns?: boolean;
    includeMetadata?: boolean;
}

interface ExportMetadata {
    exportedAt: string;
    appVersion: string;
    environment: string;
}

interface MarketplaceConfig {
    [key: string]: any;
}

/**
 * Exporta configurações de marketplace em diferentes formatos
 */
export async function exportConfiguration(
    configs: Record<string, MarketplaceConfig>,
    options: ExportOptions
): Promise<Blob> {
    switch (options.format) {
        case 'json':
            return exportAsJSON(configs, options);
        case 'csv':
            return exportAsCSV(configs, options);
        case 'pdf':
            return exportAsPDF(configs, options);
        default:
            throw new Error(`Formato não suportado: ${options.format}`);
    }
}

/**
 * Exporta como JSON (formato nativo)
 */
function exportAsJSON(
    configs: Record<string, MarketplaceConfig>,
    options: ExportOptions
): Blob {
    const data: any = {
        version: '1.0',
        configs,
    };

    if (options.includeMetadata !== false) {
        data.metadata = getMetadata();
    }

    const json = JSON.stringify(data, null, 2);
    return new Blob([json], { type: 'application/json' });
}

/**
 * Exporta como CSV (simplificado, compatível com Excel)
 */
function exportAsCSV(
    configs: Record<string, MarketplaceConfig>,
    options: ExportOptions
): Blob {
    const rows: string[] = [];

    // Header
    rows.push('Marketplace,Campo,Valor');

    // Shopee
    if (configs.shopee) {
        rows.push(`Shopee,Comissão Base,${configs.shopee.base_commission}%`);
        rows.push(`Shopee,Comissão Frete Grátis,${configs.shopee.free_shipping_commission}%`);
        rows.push(`Shopee,Participa Frete Grátis,${configs.shopee.participates_in_free_shipping ? 'Sim' : 'Não'}`);
        rows.push(`Shopee,Taxa Campanha Padrão,${configs.shopee.campaign_fee_default}%`);
        rows.push(`Shopee,Taxa Campanha Nov/Dez,${configs.shopee.campaign_fee_nov_dec}%`);
        rows.push(`Shopee,Custo Fixo,R$ ${configs.shopee.fixed_cost_per_product}`);
    }

    // Mercado Livre
    if (configs.mercado_livre) {
        rows.push(`Mercado Livre,Comissão Premium,${configs.mercado_livre.premium_commission}%`);
        configs.mercado_livre.fixed_cost_tiers?.forEach((tier: any, idx: number) => {
            const range = tier.min && tier.max
                ? `R$ ${tier.min} - R$ ${tier.max}`
                : tier.min
                    ? `Acima de R$ ${tier.min}`
                    : `Até R$ ${tier.max}`;
            rows.push(`Mercado Livre,Custo Fixo (${range}),R$ ${tier.cost}`);
        });
    }

    // Magalu
    if (configs.magalu) {
        rows.push(`Magalu,Comissão,${configs.magalu.commission}%`);
        rows.push(`Magalu,Custo Fixo,R$ ${configs.magalu.fixed_cost}`);
    }

    const csv = rows.join('\n');
    return new Blob([csv], { type: 'text/csv;charset=utf-8;' });
}

/**
 * Exporta como PDF (documentação)
 */
function exportAsPDF(
    configs: Record<string, MarketplaceConfig>,
    options: ExportOptions
): Blob {
    const doc = new jsPDF();
    let yPos = 20;

    // Título
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Configurações de Taxas - Marketplaces', 20, yPos);
    yPos += 10;

    // Metadata
    if (options.includeMetadata !== false) {
        const metadata = getMetadata();
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Exportado em: ${new Date(metadata.exportedAt).toLocaleString('pt-BR')}`, 20, yPos);
        yPos += 6;
        doc.text(`Versão: ${metadata.appVersion}`, 20, yPos);
        yPos += 10;
    }

    // Separador
    doc.setDrawColor(200, 200, 200);
    doc.line(20, yPos, 190, yPos);
    yPos += 10;

    // Shopee
    if (configs.shopee) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 102, 0); // Orange
        doc.text('Shopee', 20, yPos);
        yPos += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);

        const shopeeData = [
            ['Comissão Base:', `${configs.shopee.base_commission}%`],
            ['Comissão Frete Grátis:', `${configs.shopee.free_shipping_commission}%`],
            ['Participa Frete Grátis:', configs.shopee.participates_in_free_shipping ? 'Sim' : 'Não'],
            ['Taxa Campanha Padrão:', `${configs.shopee.campaign_fee_default}%`],
            ['Taxa Campanha Nov/Dez:', `${configs.shopee.campaign_fee_nov_dec}%`],
            ['Custo Fixo por Produto:', `R$ ${configs.shopee.fixed_cost_per_product.toFixed(2)}`],
        ];

        shopeeData.forEach(([label, value]) => {
            doc.text(label, 25, yPos);
            doc.text(value, 100, yPos);
            yPos += 6;
        });
        yPos += 5;
    }

    // Mercado Livre
    if (configs.mercado_livre) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 230, 0); // Yellow
        doc.text('Mercado Livre', 20, yPos);
        yPos += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);

        doc.text('Comissão Premium:', 25, yPos);
        doc.text(`${configs.mercado_livre.premium_commission}%`, 100, yPos);
        yPos += 8;

        doc.text('Custos Fixos por Faixa:', 25, yPos);
        yPos += 6;

        configs.mercado_livre.fixed_cost_tiers?.forEach((tier: any) => {
            const range = tier.min && tier.max
                ? `R$ ${tier.min} - R$ ${tier.max}`
                : tier.min
                    ? `Acima de R$ ${tier.min}`
                    : `Até R$ ${tier.max}`;
            doc.text(`  ${range}:`, 30, yPos);
            doc.text(`R$ ${tier.cost.toFixed(2)}`, 100, yPos);
            yPos += 5;
        });
        yPos += 5;
    }

    // Magalu
    if (configs.magalu) {
        // Nova página se necessário
        if (yPos > 250) {
            doc.addPage();
            yPos = 20;
        }

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 134, 255); // Blue
        doc.text('Magalu', 20, yPos);
        yPos += 8;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);

        const magaluData = [
            ['Comissão:', `${configs.magalu.commission}%`],
            ['Custo Fixo:', `R$ ${configs.magalu.fixed_cost.toFixed(2)}`],
        ];

        magaluData.forEach(([label, value]) => {
            doc.text(label, 25, yPos);
            doc.text(value, 100, yPos);
            yPos += 6;
        });
    }

    // Rodapé
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
            `Página ${i} de ${pageCount}`,
            doc.internal.pageSize.getWidth() / 2,
            doc.internal.pageSize.getHeight() - 10,
            { align: 'center' }
        );
    }

    return doc.output('blob');
}

/**
 * Retorna metadata do export
 */
function getMetadata(): ExportMetadata {
    return {
        exportedAt: new Date().toISOString(),
        appVersion: '0.1.0',
        environment: process.env.NODE_ENV || 'development',
    };
}

/**
 * Gera nome de arquivo para download
 */
export function getExportFilename(format: 'json' | 'csv' | 'pdf'): string {
    const date = new Date().toISOString().split('T')[0];
    return `marketplace-config-${date}.${format}`;
}

/**
 * Trigger download do blob no navegador
 */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
