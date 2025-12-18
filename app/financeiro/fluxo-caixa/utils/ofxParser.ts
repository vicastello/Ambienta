/**
 * OFX (Open Financial Exchange) Parser
 * Parses OFX/QFX bank statement files into structured transaction data
 */

export interface OFXTransaction {
    fitid: string;           // Financial Institution Transaction ID (unique)
    type: 'credit' | 'debit';
    date: Date;
    amount: number;
    name: string;            // Description/Payee
    memo?: string;
    checkNum?: string;
    refNum?: string;
}

export interface OFXStatement {
    bankId: string;
    accountId: string;
    accountType: string;
    currency: string;
    startDate: Date;
    endDate: Date;
    ledgerBalance: number;
    availableBalance?: number;
    transactions: OFXTransaction[];
}

/**
 * Parse OFX file content into structured data
 */
export function parseOFX(content: string): OFXStatement {
    // Remove SGML header and normalize whitespace
    const normalized = content
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

    // Extract the OFX portion (after headers)
    const ofxStart = normalized.indexOf('<OFX>');
    if (ofxStart === -1) {
        throw new Error('Arquivo OFX inválido: tag <OFX> não encontrada');
    }

    const ofxContent = normalized.substring(ofxStart);

    // Helper to extract tag content
    const getTagValue = (xml: string, tag: string): string | null => {
        const regex = new RegExp(`<${tag}>([^<\\n]*)`, 'i');
        const match = xml.match(regex);
        return match ? match[1].trim() : null;
    };

    // Extract bank info
    const bankId = getTagValue(ofxContent, 'BANKID') || '';
    const accountId = getTagValue(ofxContent, 'ACCTID') || '';
    const accountType = getTagValue(ofxContent, 'ACCTTYPE') || 'CHECKING';
    const currency = getTagValue(ofxContent, 'CURDEF') || 'BRL';

    // Extract date range
    const dtStart = getTagValue(ofxContent, 'DTSTART');
    const dtEnd = getTagValue(ofxContent, 'DTEND');

    const startDate = parseOFXDate(dtStart) || new Date();
    const endDate = parseOFXDate(dtEnd) || new Date();

    // Extract balances
    const ledgerBalStr = getTagValue(ofxContent, 'BALAMT') || '0';
    const ledgerBalance = parseFloat(ledgerBalStr);

    const availBalSection = ofxContent.match(/<AVAILBAL>[\s\S]*?<\/AVAILBAL>/i);
    let availableBalance: number | undefined;
    if (availBalSection) {
        const availBalStr = getTagValue(availBalSection[0], 'BALAMT');
        if (availBalStr) {
            availableBalance = parseFloat(availBalStr);
        }
    }

    // Extract transactions
    const transactions: OFXTransaction[] = [];
    const stmtTrnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
    let trnMatch;

    while ((trnMatch = stmtTrnRegex.exec(ofxContent)) !== null) {
        const trnContent = trnMatch[1];

        const trnType = getTagValue(trnContent, 'TRNTYPE') || '';
        const dtPosted = getTagValue(trnContent, 'DTPOSTED');
        const trnAmt = getTagValue(trnContent, 'TRNAMT') || '0';
        const fitid = getTagValue(trnContent, 'FITID') || crypto.randomUUID();
        const name = getTagValue(trnContent, 'NAME') || getTagValue(trnContent, 'MEMO') || 'N/D';
        const memo = getTagValue(trnContent, 'MEMO');
        const checkNum = getTagValue(trnContent, 'CHECKNUM');
        const refNum = getTagValue(trnContent, 'REFNUM');

        const amount = parseFloat(trnAmt);
        const date = parseOFXDate(dtPosted) || new Date();

        // Determine if credit or debit based on amount and type
        let type: 'credit' | 'debit';
        if (trnType === 'CREDIT' || trnType === 'DEP' || trnType === 'INT' || trnType === 'DIV') {
            type = 'credit';
        } else if (trnType === 'DEBIT' || trnType === 'CHECK' || trnType === 'FEE' || trnType === 'PAYMENT') {
            type = 'debit';
        } else {
            // Fallback to amount sign
            type = amount >= 0 ? 'credit' : 'debit';
        }

        transactions.push({
            fitid,
            type,
            date,
            amount: Math.abs(amount),
            name: cleanDescription(name),
            memo: memo ? cleanDescription(memo) : undefined,
            checkNum: checkNum || undefined,
            refNum: refNum || undefined,
        });
    }

    // Sort transactions by date (newest first)
    transactions.sort((a, b) => b.date.getTime() - a.date.getTime());

    return {
        bankId,
        accountId,
        accountType,
        currency,
        startDate,
        endDate,
        ledgerBalance,
        availableBalance,
        transactions,
    };
}

/**
 * Parse OFX date format: YYYYMMDD or YYYYMMDDHHMMSS
 */
function parseOFXDate(dateStr: string | null): Date | null {
    if (!dateStr) return null;

    // Remove timezone info if present (e.g., [-03:EST])
    const cleaned = dateStr.replace(/\[.*?\]/g, '').trim();

    if (cleaned.length >= 8) {
        const year = parseInt(cleaned.substring(0, 4), 10);
        const month = parseInt(cleaned.substring(4, 6), 10) - 1;
        const day = parseInt(cleaned.substring(6, 8), 10);

        let hours = 0, minutes = 0, seconds = 0;
        if (cleaned.length >= 14) {
            hours = parseInt(cleaned.substring(8, 10), 10);
            minutes = parseInt(cleaned.substring(10, 12), 10);
            seconds = parseInt(cleaned.substring(12, 14), 10);
        }

        return new Date(year, month, day, hours, minutes, seconds);
    }

    return null;
}

/**
 * Clean up transaction description
 */
function cleanDescription(desc: string): string {
    return desc
        .replace(/\s+/g, ' ')
        .replace(/^[\*\-\s]+/, '')
        .replace(/[\*\-\s]+$/, '')
        .trim();
}

/**
 * Check if the content is a valid OFX file
 */
export function isValidOFX(content: string): boolean {
    return content.includes('<OFX>') && content.includes('</OFX>');
}

/**
 * Convert OFX transactions to the format expected by BankReconciliationModal
 */
export function ofxToCSVFormat(statement: OFXStatement): {
    headers: string[];
    rows: string[][];
} {
    const headers = ['Data', 'Descrição', 'Valor', 'Tipo', 'ID Transação'];
    const rows = statement.transactions.map(trn => [
        trn.date.toISOString().split('T')[0],
        trn.name + (trn.memo ? ` - ${trn.memo}` : ''),
        (trn.type === 'debit' ? '-' : '') + trn.amount.toFixed(2),
        trn.type === 'credit' ? 'Crédito' : 'Débito',
        trn.fitid,
    ]);

    return { headers, rows };
}
