// Parsers for marketplace payment extracts

import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export type ParsedPayment = {
    marketplaceOrderId: string;
    paymentDate: string | null;
    settlementDate: string | null;
    grossAmount: number;
    netAmount: number;
    fees: number;
    discount: number;
    status: string;
    paymentMethod: string | null;
    rawData: any;
};

export type ParseResult = {
    success: boolean;
    payments: ParsedPayment[];
    errors: string[];
};

/**
 * Parse Magalu CSV extract
 */
export async function parseMagaluCSV(file: File): Promise<ParseResult> {
    try {
        // Read file content as text (works in Node.js)
        const csvText = await file.text();

        return new Promise((resolve) => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    const payments: ParsedPayment[] = [];
                    const errors: string[] = [];

                    results.data.forEach((row: any, index) => {
                        try {
                            // Expected columns from example:
                            // "Data de liquidação", "Data do pedido", "Número do pedido", "Status", 
                            // "Valor da parcela", "Valor de desconto...(MDR)", "Valor líquido por parcela"

                            const orderNumber = row['Número do pedido']?.trim();
                            if (!orderNumber) {
                                errors.push(`Linha ${index + 2}: Número do pedido ausente`);
                                return;
                            }

                            // Helper to parse date DD/MM/YYYY to YYYY-MM-DD
                            const parseDate = (dateStr: string): string | null => {
                                if (!dateStr) return null;
                                const parts = dateStr.split('/');
                                if (parts.length === 3) {
                                    return `${parts[2]}-${parts[1]}-${parts[0]}`;
                                }
                                return null;
                            };

                            // Parse amounts (format: "25,43")
                            const parseAmount = (value: string): number => {
                                if (!value) return 0;
                                return parseFloat(value.replace(',', '.'));
                            };

                            payments.push({
                                marketplaceOrderId: orderNumber,
                                paymentDate: parseDate(row['Data de liquidação']),
                                settlementDate: parseDate(row['Data de liquidação']),
                                grossAmount: parseAmount(row['Valor da parcela']),
                                netAmount: parseAmount(row['Valor líquido por parcela']),
                                fees: parseAmount(row['Valor de desconto das Intermediações financeiras por parcela (MDR)']),
                                discount: 0,
                                status: row['Status'] || 'unknown',
                                paymentMethod: row['Forma de pagamento'] || null,
                                rawData: row,
                            });
                        } catch (error) {
                            errors.push(`Linha ${index + 2}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
                        }
                    });

                    resolve({
                        success: errors.length === 0,
                        payments,
                        errors,
                    });
                },
                error: (error: Error) => {
                    resolve({
                        success: false,
                        payments: [],
                        errors: [error.message],
                    });
                },
            });
        });
    } catch (error) {
        return {
            success: false,
            payments: [],
            errors: ['Erro ao ler arquivo CSV: ' + (error instanceof Error ? error.message : 'desconhecido')],
        };
    }
}

/**
 * Parse Mercado Livre XLSX extract
 * NOTA: Estrutura precisa ser confirmada pelo usuário
 */
export async function parseMercadoLivreXLSX(file: File): Promise<ParseResult> {
    try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);

        const payments: ParsedPayment[] = [];
        const errors: string[] = [];

        // PLACEHOLDER: Ajustar conforme estrutura real
        // Assumindo que tem colunas: order_id, amount, date, etc.
        data.forEach((row: any, index) => {
            try {
                // Tentar encontrar campo de pedido (pode ser pack_id, order_id, etc.)
                const orderId = row.order_id || row.pack_id || row.ORDER_ID || row.PACK_ID;

                if (!orderId) {
                    errors.push(`Linha ${index + 2}: ID do pedido não encontrado`);
                    return;
                }

                payments.push({
                    marketplaceOrderId: String(orderId),
                    paymentDate: row.date || row.payment_date || null,
                    settlementDate: row.settlement_date || row.date || null,
                    grossAmount: parseFloat(row.gross_amount || row.CREDITS || 0),
                    netAmount: parseFloat(row.net_amount || row.FINAL_BALANCE || 0),
                    fees: parseFloat(row.fees || row.DEBITS || 0),
                    discount: 0,
                    status: row.status || 'released',
                    paymentMethod: null,
                    rawData: row,
                });
            } catch (error) {
                errors.push(`Linha ${index + 2}: ${error instanceof Error ? error.message : 'Erro'}`);
            }
        });

        return {
            success: errors.length < data.length / 2, // Se mais de 50% falharam, considerar falha geral
            payments,
            errors,
        };
    } catch (error) {
        return {
            success: false,
            payments: [],
            errors: [error instanceof Error ? error.message : 'Erro ao processar XLSX'],
        };
    }
}

/**
 * Parse Shopee XLSX extract
 * NOTA: Estrutura precisa ser confirmada pelo usuário
 */
export async function parseShopeeXLSX(file: File): Promise<ParseResult> {
    try {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);

        const payments: ParsedPayment[] = [];
        const errors: string[] = [];

        // PLACEHOLDER: Ajustar conforme estrutura real
        data.forEach((row: any, index) => {
            try {
                // Campos comuns do Shopee: Order ID, Amount, etc.
                const orderId = row['Order ID'] || row.order_id || row.ordersn;

                if (!orderId) {
                    errors.push(`Linha ${index + 2}: Order ID não encontrado`);
                    return;
                }

                payments.push({
                    marketplaceOrderId: String(orderId),
                    paymentDate: row.payment_date || row.release_date || null,
                    settlementDate: row.settlement_date || row.release_date || null,
                    grossAmount: parseFloat(row.order_amount || row.total || 0),
                    netAmount: parseFloat(row.seller_earnings || row.net || 0),
                    fees: parseFloat(row.commission_fee || row.fees || 0),
                    discount: parseFloat(row.discount || 0),
                    status: row.status || 'completed',
                    paymentMethod: null,
                    rawData: row,
                });
            } catch (error) {
                errors.push(`Linha ${index + 2}: ${error instanceof Error ? error.message : 'Erro'}`);
            }
        });

        return {
            success: errors.length < data.length / 2,
            payments,
            errors,
        };
    } catch (error) {
        return {
            success: false,
            payments: [],
            errors: [error instanceof Error ? error.message : 'Erro ao processar XLSX'],
        };
    }
}

/**
 * Main parser router
 */
export async function parsePaymentFile(
    file: File,
    marketplace: 'magalu' | 'mercado_livre' | 'shopee'
): Promise<ParseResult> {
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (marketplace === 'magalu') {
        if (extension !== 'csv') {
            return {
                success: false,
                payments: [],
                errors: ['Magalu: esperado arquivo CSV'],
            };
        }
        return parseMagaluCSV(file);
    }

    if (marketplace === 'mercado_livre') {
        if (extension !== 'xlsx') {
            return {
                success: false,
                payments: [],
                errors: ['Mercado Livre: esperado arquivo XLSX'],
            };
        }
        return parseMercadoLivreXLSX(file);
    }

    if (marketplace === 'shopee') {
        if (extension !== 'xlsx') {
            return {
                success: false,
                payments: [],
                errors: ['Shopee: esperado arquivo XLSX'],
            };
        }
        return parseShopeeXLSX(file);
    }

    return {
        success: false,
        payments: [],
        errors: ['Marketplace não reconhecido'],
    };
}
