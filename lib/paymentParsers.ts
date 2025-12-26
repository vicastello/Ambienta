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
    transactionType?: string; // Ex: "Renda do pedido", "Ajuste", "Retirada"
    transactionDescription?: string; // Full description from extract
    balanceAfter?: number; // Balance after transaction
    isExpense?: boolean; // True for outgoing transactions (fees, ads, etc)
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
                delimiter: '', // Auto-detect delimiter
                complete: (results) => {
                    const payments: ParsedPayment[] = [];
                    const errors: string[] = [];

                    results.data.forEach((row: any, index) => {
                        try {
                            // Expected columns from example:
                            // "Data de liquidação", "Data do pedido", "Número do pedido", "Status", 
                            // "Valor da parcela", "Valor de desconto...(MDR)", "Valor líquido por parcela"

                            // Helper to find value by fuzzy key match (ignores trim/case)
                            // Helper to find value by fuzzy key match
                            // Normalizes keys: lowercase, remove accents, trim
                            const normalizeKey = (k: string) =>
                                k.toLowerCase()
                                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                                    .trim();

                            const getValue = (keys: string[], targetKey: string): string => {
                                // 1. Try exact match
                                if (row[targetKey] !== undefined) return row[targetKey];

                                // 2. Try normalized match
                                const normalizedTarget = normalizeKey(targetKey);
                                const foundKey = keys.find(k => normalizeKey(k) === normalizedTarget);
                                if (foundKey) return row[foundKey];

                                // 3. Fallback: Check for partial match (specific for 'liquido')
                                if (targetKey.includes('líquido')) {
                                    const fallback = keys.find(k => {
                                        const nk = normalizeKey(k);
                                        // Robust check: 'quido' works even if 'í' is garbled
                                        return nk.includes('valor') && nk.includes('quido') && nk.includes('parcela');
                                    });
                                    if (fallback) return row[fallback];
                                }
                                return '';
                            };

                            const keys = Object.keys(row);

                            // Parse amounts (format: "25,43", "1.200,50", "R$ 25,00")
                            const parseAmount = (value: string): number => {
                                if (!value) return 0;
                                // 1. Remove quotes and extra whitespace
                                let v = value.toString().replace(/['"]/g, '').trim();
                                // 2. Remove currency symbol if present
                                v = v.replace(/^R\$\s?/, '');
                                // 3. Handle Brazilian format (Check for comma as decimal)
                                if (v.includes(',')) {
                                    v = v.replace(/\./g, ''); // Remove thousands separator dots
                                    v = v.replace(',', '.');  // Replace decimal comma
                                }
                                return parseFloat(v) || 0;
                            };


                            const netValRaw = getValue(keys, 'Valor líquido por parcela');
                            const netValParsed = parseAmount(netValRaw);



                            const orderNumber = getValue(keys, 'Número do pedido')?.trim();
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



                            payments.push({
                                marketplaceOrderId: orderNumber,
                                paymentDate: parseDate(getValue(keys, 'Data de liquidação')),
                                settlementDate: parseDate(getValue(keys, 'Data de liquidação')),
                                grossAmount: parseAmount(getValue(keys, 'Valor da parcela')),
                                netAmount: parseAmount(getValue(keys, 'Valor líquido por parcela')),
                                fees: parseAmount(getValue(keys, 'Valor de desconto das Intermediações financeiras por parcela (MDR)')),
                                discount: 0,
                                status: getValue(keys, 'Status') || 'unknown',
                                paymentMethod: getValue(keys, 'Forma de pagamento') || null,
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
        const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        const payments: ParsedPayment[] = [];
        const errors: string[] = [];

        // 1. Find Header Row
        let headerRowIndex = -1;
        const normalizeKey = (k: string) =>
            k.toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .trim();

        for (let i = 0; i < Math.min(data.length, 50); i++) {
            const row = data[i];
            if (Array.isArray(row) && row.some(cell => {
                const normalized = normalizeKey(String(cell));
                return normalized === 'id do pedido' ||
                    normalized === 'numero do pedido' ||
                    normalized === 'order id' ||
                    normalized === 'order sn' ||
                    normalized === 'no. pedido';
            })) {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex === -1) {
            return {
                success: false,
                payments: [],
                errors: ['Cabeçalho não encontrado no arquivo Shopee (ID do pedido)'],
            };
        }

        const rawHeaders = data[headerRowIndex].map(h => String(h || ''));
        const headers = rawHeaders.map(normalizeKey);
        const rows = data.slice(headerRowIndex + 1);

        const getColumnIndex = (targets: string[]): number => {
            return headers.findIndex(h => {
                // Check if header matches any of the target aliases (normalized)
                return targets.some(t => h === normalizeKey(t) || h.includes(normalizeKey(t)));
            });
        };

        const idxOrder = getColumnIndex(['ID do pedido', 'Order ID', 'No. do pedido']);
        const idxAmount = getColumnIndex(['Valor', 'Amount', 'Total amount']);
        const idxDate = getColumnIndex(['Data', 'Date', 'Time', 'Data e Hora']);
        const idxStatus = getColumnIndex(['Status', 'Estado']);
        const idxDescription = getColumnIndex(['Descrição', 'Description', 'Detalhes']);
        const idxTransactionType = getColumnIndex(['Tipo de transação', 'Transaction Type', 'Tipo']);

        if (idxOrder === -1) {
            // If we can't even find the order ID column, we can't parse correctly
            return {
                success: false,
                payments: [],
                errors: ['Coluna "ID do pedido" não encontrada no arquivo Shopee.'],
            };
        }

        const parseAmount = (value: any): number => {
            if (typeof value === 'number') return value;
            if (!value) return 0;
            let v = String(value).replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.').trim();
            return parseFloat(v) || 0;
        };

        // Helper to generate ID from datetime: DDMMYYYYHHMMSS + Index
        const generateIdFromDate = (prefix: string, dateValue: any, rowIndex: number): string => {
            let date: Date;
            if (typeof dateValue === 'number') {
                date = new Date((dateValue - 25569) * 86400 * 1000);
            } else if (typeof dateValue === 'string') {
                // Try parsing string formats
                const parts = dateValue.split(/[-/ :]/);
                if (dateValue.includes('-')) {
                    // YYYY-MM-DD HH:MM:SS
                    date = new Date(dateValue);
                } else if (dateValue.includes('/')) {
                    // DD/MM/YYYY HH:MM
                    // parts: 0=DD, 1=MM, 2=YYYY, 3=HH, 4=MM
                    const day = parseInt(parts[0]);
                    const month = parseInt(parts[1]) - 1;
                    const year = parseInt(parts[2]);
                    const hour = parts.length > 3 ? parseInt(parts[3]) : 0;
                    const min = parts.length > 4 ? parseInt(parts[4]) : 0;
                    const sec = parts.length > 5 ? parseInt(parts[5]) : 0;
                    date = new Date(year, month, day, hour, min, sec);
                } else {
                    date = new Date(); // Fallback
                }
            } else {
                date = new Date();
            }

            // Verify if date is valid
            if (isNaN(date.getTime())) date = new Date();

            const dd = String(date.getDate()).padStart(2, '0');
            const MM = String(date.getMonth() + 1).padStart(2, '0');
            const yyyy = date.getFullYear();
            const hh = String(date.getHours()).padStart(2, '0');
            const mm = String(date.getMinutes()).padStart(2, '0');
            const ss = String(date.getSeconds()).padStart(2, '0');

            // Add row index to guarantee uniqueness even within same second
            const idx = String(rowIndex).padStart(3, '0');

            return `${prefix}${dd}${MM}${yyyy}${hh}${mm}${ss}${idx}`;
        };

        const parseDate = (value: any): string | null => {
            if (!value) return null;
            // Handle XLSX date numbers or strings
            if (typeof value === 'number') {
                // XLSX dates are serial numbers. 25569 is the offset for Unix epoch.
                // Use UTC to avoid timezone issues
                const date = new Date((value - 25569) * 86400 * 1000);
                // Format using UTC methods to avoid timezone shift
                const year = date.getUTCFullYear();
                const month = String(date.getUTCMonth() + 1).padStart(2, '0');
                const day = String(date.getUTCDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            }
            const dateStr = String(value).trim();
            // Expected: YYYY-MM-DD HH:MM:SS or DD/MM/YYYY
            if (dateStr.includes('-')) {
                // Extract just the date part (YYYY-MM-DD)
                return dateStr.split(' ')[0];
            }
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    return `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
            }
            return null;
        };

        const seenIds = new Map<string, number>();

        rows.forEach((row, index) => {
            if (!row || row.length === 0) return;

            try {
                let orderId = String(row[idxOrder] || '').trim();
                const transactionDesc = idxDescription !== -1 ? String(row[idxDescription] || '') : '';

                // Skip only completely empty rows
                if (!orderId && !transactionDesc) {
                    return;
                }

                // Get transaction type
                // Use index found outside loop
                const transactionType = idxTransactionType !== -1 ? String(row[idxTransactionType] || '') : '';

                // If no Order ID, generate one based on transaction type + date
                if (!orderId || orderId.toLowerCase() === 'null' || orderId.toLowerCase() === 'undefined') {
                    // Rule: Use first 3 letters of transaction type
                    let prefix = 'TRX'; // Default fallback

                    // Try to get prefix from transactionType first, then description
                    const sourceText = transactionType || transactionDesc || 'GENERICO';

                    // Clean text: remove accents, special chars, uppercase
                    const cleanText = sourceText
                        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
                        .replace(/[^a-zA-Z0-9]/g, "") // Remove non-alphanumeric
                        .toUpperCase();

                    if (cleanText.length >= 2) {
                        prefix = cleanText.substring(0, 3);
                    }

                    orderId = generateIdFromDate(prefix, row[idxDate], index);
                    // console.log(`[Shopee] Generated ID for missing order: ${orderId} (Type: ${transactionType})`);
                } else {
                    // Regular logic for existing Order IDs
                    // Create a unique suffix based on transaction type to prevent overwriting
                    // This ensures "Renda do pedido" and "Ajuste" for the same order get different IDs
                    const typeIndicator = transactionType.toLowerCase().includes('ajuste') ? '_AJUSTE' :
                        transactionType.toLowerCase().includes('reembolso') ? '_REEMBOLSO' :
                            transactionType.toLowerCase().includes('retirada') ? '_RETIRADA' : '';

                    orderId = orderId + typeIndicator;
                }

                // Handle duplicates within the file (append _1, _2 if same ID generated)
                const baseId = orderId;
                if (seenIds.has(baseId)) {
                    const count = seenIds.get(baseId)! + 1;
                    seenIds.set(baseId, count);
                    orderId = `${baseId}_${count}`;
                } else {
                    seenIds.set(baseId, 1);
                    orderId = baseId;
                }


                const idxBalanceAfter = getColumnIndex(['Balança após as transações', 'Balance after']);
                // Check multiple possible column names for money direction
                let idxMovementType = getColumnIndex(['Tipo de movimentação', 'Movement Type', 'Direção do dinheiro']);

                const amount = parseAmount(row[idxAmount]);
                const movementType = idxMovementType !== -1 ? String(row[idxMovementType] || '') : '';

                // Determine if it's an expense (saída) or income (entrada)
                // Check for "Recarga" or "ADS" - but EXCLUDE refunds/reversals
                const cleanDesc = (transactionType + transactionDesc).toLowerCase();
                const isAdsOrRecharge = cleanDesc.match(/recarga|ads|publicidade/) &&
                    !cleanDesc.match(/reembolso|estorno|cancelamento/);

                const isExpense = movementType.toLowerCase().includes('saída') ||
                    movementType.toLowerCase().includes('saida') ||
                    amount < 0 ||
                    !!isAdsOrRecharge;

                payments.push({
                    marketplaceOrderId: orderId || 'NO_ORDER_ID', // For expenses without order
                    paymentDate: parseDate(row[idxDate]),
                    settlementDate: parseDate(row[idxDate]),
                    grossAmount: Math.abs(amount),
                    netAmount: Math.abs(amount), // Use absolute value, direction is in metadata
                    fees: 0,
                    discount: 0,
                    status: String(row[idxStatus] || 'completed'),
                    paymentMethod: 'shopee_pay',
                    transactionType: idxTransactionType !== -1 ? String(row[idxTransactionType] || '') : undefined,
                    transactionDescription: transactionDesc,
                    balanceAfter: idxBalanceAfter !== -1 ? parseAmount(row[idxBalanceAfter]) : undefined,
                    isExpense, // New field to mark expenses
                    rawData: row,
                });
            } catch (error) {
                errors.push(`Linha ${headerRowIndex + index + 2}: ${error instanceof Error ? error.message : 'Erro'}`);
            }
        });

        return {
            success: payments.length > 0,
            payments,
            errors,
        };
    } catch (error) {
        return {
            success: false,
            payments: [],
            errors: [error instanceof Error ? error.message : 'Erro ao processar Shopee XLSX'],
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
