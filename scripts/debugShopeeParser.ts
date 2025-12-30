
import * as XLSX from 'xlsx';

// Mock the parser logic roughly to test the critical parts
function testShopeeLogic() {
    console.log("Starting Shopee Parser Test...\n");

    // Mock Data: Array of Arrays (as returned by sheet_to_json with header:1)
    const mockData = [
        ["Some metadata", "", ""],
        ["More metadata", "", ""],
        // English Headers
        ["Order ID", "Order SN", "Transaction Type", "Date", "Amount", "Description"],
        // Rows
        ["231215ABC123", "231215ABC123", "Order Income", "2023-12-15 10:00", "50.00", "Sale"], // Normal order
        ["", "", "Adjustment", "2023-12-16 14:30", "-10.00", "Lost package"], // Adjustment (should gen ID: AJU...)
        [null, null, "Withdrawal", "2023-12-17 09:15", "-100.00", "To Bank"], // Withdrawal (should gen ID: WIT...)
        ["", "", "Recarga", "18/12/2023 20:00", "-50.00", "Ads credit"], // Recharge PT-BR date (should gen ID: REC...)
        ["", "", "Adjustment", "2025-01-20 10:00", "-5.00", "Adjustment for order 240101789ABC missing weight"], // should recover 240101789ABC
        // Empty row
        ["", "", "", "", "", ""],
    ];

    // --- LOGIC FROM paymentParsers.ts ---

    // 1. Find Header Row
    let headerRowIndex = -1;
    const normalizeKey = (k: string) =>
        String(k).toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .trim();

    for (let i = 0; i < Math.min(mockData.length, 50); i++) {
        const row = mockData[i] as any[];
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
        console.error("❌ Header not found!");
        return;
    }
    console.log(`✅ Header found at row ${headerRowIndex}`);

    const rawHeaders = (mockData[headerRowIndex] as any[]).map(h => String(h || ''));
    const headers = rawHeaders.map(normalizeKey);
    const rows = mockData.slice(headerRowIndex + 1);

    const getColumnIndex = (targets: string[]): number => {
        return headers.findIndex(h => {
            return targets.some(t => h === normalizeKey(t) || h.includes(normalizeKey(t)));
        });
    };

    const idxOrder = getColumnIndex(['ID do pedido', 'Order ID', 'No. do pedido']);
    const idxTransactionType = getColumnIndex(['Tipo de transação', 'Transaction Type', 'Tipo']);
    const idxDate = getColumnIndex(['Data', 'Date', 'Time', 'Data e Hora']);
    const idxDescription = getColumnIndex(['Descrição', 'Description', 'Detalhes']);

    console.log("Column Indices:", { idxOrder, idxTransactionType, idxDate, idxDescription });

    // Helper from file
    const generateIdFromDate = (prefix: string, dateValue: any, rowIndex: number): string => {
        let date: Date;
        if (typeof dateValue === 'number') {
            date = new Date((dateValue - 25569) * 86400 * 1000);
        } else if (typeof dateValue === 'string') {
            const parts = dateValue.split(/[-/ :]/).filter((p: string) => p.trim() !== ''); // Filter empty splits
            if (dateValue.includes('-')) {
                // YYYY-MM-DD HH:MM implies parts[0]=YYYY
                // "2023-12-15 10:00" -> 2023, 12, 15, 10, 00
                // Date constructor args: year, monthIndex (0-11), day, hour...
                if (parts[0].length === 4) {
                    const year = parseInt(parts[0]);
                    const month = parseInt(parts[1]) - 1;
                    const day = parseInt(parts[2]);
                    const hour = parts.length > 3 ? parseInt(parts[3]) : 0;
                    const min = parts.length > 4 ? parseInt(parts[4]) : 0;
                    const sec = parts.length > 5 ? parseInt(parts[5]) : 0;
                    date = new Date(year, month, day, hour, min, sec);
                } else {
                    date = new Date(dateValue);
                }
            } else if (dateValue.includes('/')) {
                // DD/MM/YYYY
                const day = parseInt(parts[0]);
                const month = parseInt(parts[1]) - 1;
                const year = parseInt(parts[2]);
                const hour = parts.length > 3 ? parseInt(parts[3]) : 0;
                const min = parts.length > 4 ? parseInt(parts[4]) : 0;
                const sec = parts.length > 5 ? parseInt(parts[5]) : 0;
                date = new Date(year, month, day, hour, min, sec);
            } else {
                date = new Date();
            }
        } else {
            date = new Date();
        }

        if (isNaN(date.getTime())) date = new Date();

        const dd = String(date.getDate()).padStart(2, '0');
        const MM = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        const ss = String(date.getSeconds()).padStart(2, '0');
        const idx = String(rowIndex).padStart(3, '0');

        return `${prefix}${dd}${MM}${yyyy}${hh}${mm}${ss}${idx}`;
    };

    rows.forEach((row: any[], index) => {
        if (!row || row.length === 0) return;

        let orderId = String(row[idxOrder] || '').trim();
        const transactionDesc = idxDescription !== -1 ? String(row[idxDescription] || '') : '';
        const transactionType = idxTransactionType !== -1 ? String(row[idxTransactionType] || '') : '';

        // Skip completely empty
        if (!orderId && !transactionDesc && !transactionType) return;

        console.log(`\nRow ${index}: Original OrderID='${orderId}', Type='${transactionType}', Date='${row[idxDate]}'`);

        if (!orderId || ['null', 'undefined', '0', '-', 'nan', 'n/a'].includes(orderId.toLowerCase())) {
            // 1. Try to extract Order ID from description first!
            const idMatch = transactionDesc ? transactionDesc.match(/\b2[0-9][0-9A-Z]{10,}\b/) : null;

            if (idMatch) {
                orderId = idMatch[0];
                console.log(`   -> RECOVERED ID from description: ${orderId}`);
            } else {
                let prefix = 'TRX';
                const sourceText = transactionType || transactionDesc || 'GENERICO';
                const cleanText = sourceText
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-zA-Z0-9]/g, "")
                    .toUpperCase();

                if (cleanText.length >= 2) {
                    prefix = cleanText.substring(0, 3);
                }

                const newId = generateIdFromDate(prefix, row[idxDate], index);
                console.log(`   -> GENERATED ID: ${newId}`);
                orderId = newId;
            }
        } else {
            console.log(`   -> KEPT ID: ${orderId}`);
        }

        const idxCommission = getColumnIndex(['Taxa de comissão', 'Commission Fee']);
        const idxService = getColumnIndex(['Taxa de serviço', 'Service Fee']);
        const idxTransaction = getColumnIndex(['Taxa de transação', 'Transaction Fee']);
        const idxAffiliate = getColumnIndex(['Comissão de afiliado', 'Affiliate Commission', 'Custo de campanha']);

        const commission = idxCommission !== -1 ? Math.abs(parseFloat(String(row[idxCommission] || '0').replace(',', '.'))) : 0;
        const service = idxService !== -1 ? Math.abs(parseFloat(String(row[idxService] || '0').replace(',', '.'))) : 0;
        const transaction = idxTransaction !== -1 ? Math.abs(parseFloat(String(row[idxTransaction] || '0').replace(',', '.'))) : 0;
        const affiliate = idxAffiliate !== -1 ? Math.abs(parseFloat(String(row[idxAffiliate] || '0').replace(',', '.'))) : 0;

        const totalFees = commission + service + transaction + affiliate;
        console.log(`   -> FEES: ${totalFees.toFixed(2)} (Comm: ${commission}, Serv: ${service}, Trx: ${transaction}, Aff: ${affiliate})`);

        // Only apply suffixes if it's a 'real' order ID (recovered or original)
        // Regular logic for existing Order IDs
        const typeIndicator = transactionType.toLowerCase().includes('ajuste') ? '_AJUSTE' :
            transactionType.toLowerCase().includes('reembolso') ? '_REEMBOLSO' :
                transactionType.toLowerCase().includes('retirada') ? '_RETIRADA' : '';

        if (!orderId.includes(typeIndicator)) {
            orderId = orderId + typeIndicator;
            console.log(`   -> SUFFIXED ID: ${orderId}`);
        }
    });

}

testShopeeLogic();

