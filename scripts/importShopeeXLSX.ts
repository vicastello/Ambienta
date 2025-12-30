#!/usr/bin/env tsx

/**
 * Script para importar histórico de pedidos da Shopee via arquivo Excel (.xlsx).
 * 
 * Uso:
 *   npx tsx scripts/importShopeeXLSX.ts <caminho-do-arquivo.xlsx>
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// Carregar variáveis de ambiente com prioridade
const envFiles = ['.env.development.local', '.env.local', '.env'];
for (const file of envFiles) {
    config({ path: resolve(process.cwd(), file), override: true });
}

// Configuração Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const shopeeShopId = parseInt(process.env.SHOPEE_SHOP_ID || '0', 10);

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Erro: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
    process.exit(1);
}

if (!shopeeShopId) {
    console.warn('⚠️  Aviso: SHOPEE_SHOP_ID não encontrado. Usando 0 como padrão.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Mapeamento de Status (PT -> Shopee Enum)
const STATUS_MAP: Record<string, string> = {
    'Concluído': 'COMPLETED',
    'Cancelado': 'CANCELLED',
    'A Enviar': 'READY_TO_SHIP',
    'A Pagar': 'UNPAID',
    'Pago': 'READY_TO_SHIP', // Assumindo que pago vai para envio
    'Enviado': 'PROCESSED', // Enviado para transportadora
    'Entregue': 'COMPLETED',
    'Reembolso': 'TO_RETURN',
    'Devolução': 'TO_RETURN',
};

// Funções Auxiliares
function parseDate(dateStr: string | number): number {
    if (!dateStr) return Date.now();
    // Se vier como número do Excel (dias desde 1900)
    if (typeof dateStr === 'number') {
        return new Date((dateStr - (25567 + 2)) * 86400 * 1000).getTime();
    }
    // Se vier como string "YYYY-MM-DD HH:mm"
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? Date.now() : d.getTime();
}

function parseCurrency(value: string | number): number {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    return parseFloat(value.replace('R$', '').trim().replace(',', '.')) || 0;
}

function mapStatus(rawStatus: string): string {
    const norm = rawStatus?.trim() || '';
    return STATUS_MAP[norm] || 'UNPAID'; // Default safe
}

// Tipo temporário para o item do Excel
interface ExcelRow {
    'ID do pedido': string;
    'Status do pedido': string;
    'Data de criação do pedido': string;
    'Valor Total': number | string;
    'Código do Cupom': string;
    'Nome do Produto': string;
    'Número de referência SKU': string;
    'Preço acordado': number | string;
    'Quantidade': number | string;
    'Nome de usuário (comprador)': string;
    'Nome do destinatário': string;
    'Telefone': string;
    'Endereço de entrega': string;
    'Cidade': string;
    'UF': string;
    'Data da Finalização do Cancelamento'?: string;
    'Tempo de Envio'?: string;
    [key: string]: any;
}

async function importShopeeXLSX(filePath: string) {
    console.log(`\n📂 Lendo arquivo: ${filePath}`);

    if (!fs.existsSync(filePath)) {
        console.error('❌ Arquivo não encontrado');
        process.exit(1);
    }

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<ExcelRow>(worksheet);

    console.log(`📊 Total de linhas encontradas: ${rows.length}`);

    // Agrupar por ID do Pedido
    const ordersMap = new Map<string, ExcelRow[]>();

    for (const row of rows) {
        const id = row['ID do pedido'];
        if (!id) continue;
        if (!ordersMap.has(id)) {
            ordersMap.set(id, []);
        }
        ordersMap.get(id)?.push(row);
    }

    console.log(`📦 Total de pedidos únicos: ${ordersMap.size}`);

    let processed = 0;
    let errors = 0;
    let itemsProcessed = 0;
    const BATCH_SIZE = 50;
    let batchData: any[] = [];
    let itemsBatchData: any[] = [];

    // Helper to generate a pseudo item_id from SKU string
    const hashCode = (str: string): number => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    };

    for (const [orderId, items] of ordersMap) {
        try {
            const first = items[0];
            const createTime = parseDate(first['Data de criação do pedido']);
            // Tenta pegar update time de cancelamento ou envio, senão criação
            const updateTime = first['Data da Finalização do Cancelamento']
                ? parseDate(first['Data da Finalização do Cancelamento'])
                : (first['Tempo de Envio'] ? parseDate(first['Tempo de Envio']) : createTime);

            const orderItems = items.map(item => ({
                item_id: 0, // Não temos ID do item da Shopee no Excel, usar 0 ou gerar hash?
                item_name: item['Nome do Produto'],
                model_id: 0,
                model_name: item['Nome da variação'] || '',
                item_sku: item['Número de referência SKU'] || '',
                model_sku: item['Número de referência SKU'] || '', // Assume mesmo SKU se não tiver variação
                variation_original_price: String(item['Preço original'] || item['Preço acordado']),
                variation_discounted_price: String(item['Preço acordado']),
                is_wholesale: false
            }));

            // Construcao do objeto ShopeeOrder (raw_payload)
            const rawPayload = {
                order_sn: orderId,
                order_status: mapStatus(first['Status do pedido']),
                create_time: Math.floor(createTime / 1000), // Shopee usa Unix seconds
                update_time: Math.floor(updateTime / 1000),
                total_amount: String(first['Valor Total']),
                currency: 'BRL',
                cod: false, // Não tem info clara no Excel importado, default false
                order_items: orderItems,
                shipping_carrier: first['Opção de envio'],
                recipient_address: {
                    name: first['Nome do destinatário'],
                    phone: first['Telefone'],
                    full_address: `${first['Endereço de entrega']}, ${first['Bairro'] || ''}, ${first['Cidade']} - ${first['UF']}, ${first['CEP'] || ''}`,
                    city: first['Cidade'],
                    state: first['UF'],
                    zipcode: first['CEP']
                }
            };

            // Objeto para DB
            // Extrair dados de cupom/desconto do Excel - SOMAR de todos os itens
            const voucherFromSeller = parseCurrency(first['Cupom do vendedor']); // Cupom é por pedido, não por item
            const voucherFromShopee = parseCurrency(first['Cupom Shopee']); // Cupom Shopee é por pedido
            // Descontos e subtotais precisam ser somados de todos os itens
            const sellerDiscount = items.reduce((sum, item) => sum + parseCurrency(item['Desconto do vendedor']), 0);
            const sellerVoucherCode = first['Código do Cupom'] || null;
            const orderSellingPrice = items.reduce((sum, item) => sum + parseCurrency(item['Subtotal do produto']), 0);
            const amsCommissionFee = parseCurrency(first['Seller Absorbed Coin Cashback']); // Cashback é por pedido

            const dbOrder = {
                order_sn: orderId,
                shop_id: shopeeShopId,
                order_status: rawPayload.order_status,
                create_time: new Date(createTime).toISOString(),
                update_time: new Date(updateTime).toISOString(),
                total_amount: parseCurrency(first['Valor Total']),
                currency: 'BRL',
                cod: false,
                shipping_carrier: first['Opção de envio'],
                buyer_username: first['Nome de usuário (comprador)'],
                recipient_name: first['Nome do destinatário'],
                recipient_phone: first['Telefone'],
                recipient_full_address: rawPayload.recipient_address.full_address,
                recipient_city: first['Cidade'],
                recipient_state: first['UF'],
                raw_payload: rawPayload,
                created_at: new Date(createTime).toISOString(),
                updated_at: new Date().toISOString(),
                // Campos de voucher e desconto (novos)
                voucher_from_seller: voucherFromSeller,
                voucher_from_shopee: voucherFromShopee,
                seller_discount: sellerDiscount,
                // seller_voucher_code removido - causa conflito de tipo no PG (array vs string)
                order_selling_price: orderSellingPrice,
                ams_commission_fee: amsCommissionFee,
            };

            batchData.push(dbOrder);

            // Preparar items para shopee_order_items
            for (let idx = 0; idx < items.length; idx++) {
                const item = items[idx];
                const sku = item['Número de referência SKU'] || '';
                const itemId = hashCode(`${orderId}_${sku}_${idx}`); // Gera ID único baseado em pedido+sku+indice

                itemsBatchData.push({
                    order_sn: orderId,
                    item_id: itemId,
                    item_name: item['Nome do Produto'] || 'Produto sem nome',
                    model_id: 0,
                    model_name: item['Nome da variação'] || '',
                    item_sku: sku,
                    model_sku: sku,
                    original_price: parseCurrency(item['Preço original'] || item['Preço acordado']),
                    discounted_price: parseCurrency(item['Preço acordado']),
                    quantity: parseInt(String(item['Quantidade'])) || 1,
                    is_wholesale: false,
                    raw_payload: { excel_row: item }
                });
            }

            // Processar Batch
            if (batchData.length >= BATCH_SIZE) {
                const { error } = await supabase
                    .from('shopee_orders')
                    .upsert(batchData, { onConflict: 'order_sn' }); // Update se existir

                if (error) {
                    console.error(`❌ Erro no batch orders: ${error.message}`);
                    errors += batchData.length;
                } else {
                    processed += batchData.length;
                    process.stdout.write(`.`);
                }
                batchData = [];

                // Inserir itens correspondentes
                if (itemsBatchData.length > 0) {
                    const { error: itemsError } = await supabase
                        .from('shopee_order_items')
                        .upsert(itemsBatchData, { onConflict: 'order_sn,item_id,model_id' });

                    if (itemsError) {
                        console.error(`❌ Erro no batch items: ${itemsError.message}`);
                    } else {
                        itemsProcessed += itemsBatchData.length;
                    }
                    itemsBatchData = [];
                }
            }

        } catch (err) {
            console.error(`❌ Erro processando pedido ${orderId}:`, err);
            errors++;
        }
    }

    // Final Batch
    if (batchData.length > 0) {
        const { error } = await supabase
            .from('shopee_orders')
            .upsert(batchData, { onConflict: 'order_sn' });

        if (error) {
            console.error(`❌ Erro no ultimo batch: ${error.message}`);
            errors += batchData.length;
        } else {
            processed += batchData.length;
        }
    }

    // Final Items Batch
    if (itemsBatchData.length > 0) {
        const { error: itemsError } = await supabase
            .from('shopee_order_items')
            .upsert(itemsBatchData, { onConflict: 'order_sn,item_id,model_id' });

        if (itemsError) {
            console.error(`❌ Erro no ultimo batch items: ${itemsError.message}`);
        } else {
            itemsProcessed += itemsBatchData.length;
        }
    }

    console.log(`\n\n✅ Importação Concluída!`);
    console.log(`   Pedidos processados: ${processed}`);
    console.log(`   Itens processados: ${itemsProcessed}`);
    console.log(`   Erros: ${errors}`);
}

const targetFile = process.argv[2];
if (!targetFile) {
    console.error('Uso: npx tsx scripts/importShopeeXLSX.ts <arquivo.xlsx>');
    process.exit(1);
}

importShopeeXLSX(resolve(process.cwd(), targetFile));
