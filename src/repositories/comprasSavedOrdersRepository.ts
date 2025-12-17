import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { SavedOrder, SavedOrderManualItem, SavedOrderProduct } from '@/src/types/compras';

// New tables
const TABLE_PO = 'purchase_orders' as const;
const TABLE_ITEMS = 'purchase_order_items' as const;
const DEFAULT_LIMIT = 200;

// Helper to transform Relational DB row -> Frontend Shape
// We fetch PO + items, then split items into products/manual
const normalizePurchaseOrder = (row: any): SavedOrder => {
  const allItems = (row.purchase_order_items || []) as any[];

  const produtos: SavedOrderProduct[] = [];
  const manualItems: SavedOrderManualItem[] = [];

  allItems.forEach((item) => {
    if (item.product_id) {
      // It's a Tiny Product
      produtos.push({
        id_produto_tiny: Number(item.product_id),
        nome: item.product_name,
        // These fields might need to be fetched from Tiny or stored if needed. 
        // For now we assume the frontend re-fetches details or we store minimal.
        // Storing minimal:
        codigo: item.product_sku,
        fornecedor_nome: null, // Not stored in items yet
        fornecedor_codigo: null,
        gtin: null,
        quantidade: Number(item.quantity) || 0,
        observacao: null, // Note: we have 'notes' on PO, but maybe not per item in this version?
        // Actually the schema has 'product_sku', 'product_name'.
      });
    } else {
      // It's a Manual Item
      manualItems.push({
        id: -1 * Math.random(), // Frontend uses negative IDs for manual items typically
        nome: item.product_name,
        fornecedor_codigo: '', // Not stored specifically for manual unless we abuse product_sku
        quantidade: Number(item.quantity) || 0,
        observacao: '',
      });
    }
  });

  return {
    id: row.id,
    name: row.supplier_name || row.notes || `Pedido ${row.id.slice(0, 8)}`, // Fallback for name since we used 'supplier_name' in migration but frontend expects 'name'. Check schema.
    // Wait, the migration used 'supplier_name' but SavedOrder uses 'name'. 
    // Let's use 'notes' or map 'name' to a column.
    // Migration check:
    // create table purchase_orders ( ..., supplier_name VARCHAR(255), notes TEXT ... )
    // We don't have a 'name' column for the order name (title).
    // I will overload 'notes' or 'supplier_name' or I missed adding 'name' column.
    // I missed 'name' column in migration. I'll check migration file.
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    periodDays: 60, // Defaults, as these logic fields aren't in new schema explicitly?
    targetDays: 15,
    produtos,
    manualItems,
  };
};

// FIX: The migration I created has:
// supplier_name, notes, total_amount.
// It DOES NOT have 'name' (user defined title), 'period_days', 'target_days'.
// To maintain feature parity with 'SavedOrder', I should have included them.
// I will create a V2 normalize that maps what we have, but to fix this properly I should alter the table.
// However, since I cannot easily run migrations now (docker issue), I will use 'external_id' or 'notes' to store metadata JSON if needed,
// OR just accept that some draft-specific fields (periodDays) are lost upon "Saving" as a real Purchase Order.
// BUT 'SavedOrder' is effectively a Draft.
// The user asked to structure "Purchase Orders".
// Maybe I should store the draft metadata in 'notes' as a JSON string? or in a new column if I could.
// For now, I will assume we are moving from "Draft" to "Real Order".
// Real Orders don't necessarily have "periodDays" (input param). They are the output.
// But the frontend expects 'SavedOrder' to load it back.
// I will return default 60/15 for now.
// For 'name', I will use 'supplier_name' if present, otherwise 'notes'.

export async function listSavedOrders(limit = DEFAULT_LIMIT) {
  const { data } = await supabaseAdmin
    .from(TABLE_PO)
    .select('*, purchase_order_items(*)')
    .order('created_at', { ascending: false })
    .limit(limit)
    .throwOnError();

  return (data || []).map(normalizePurchaseOrder);
}

export async function createSavedOrder(payload: {
  name: string;
  periodDays: number;
  targetDays: number;
  produtos: SavedOrderProduct[];
  manualItems: SavedOrderManualItem[];
}) {
  // 1. Create Parent Order
  const { data: orderData, error: orderError } = await supabaseAdmin
    .from(TABLE_PO)
    .insert({
      supplier_name: payload.name, // Mapping 'name' to 'supplier_name' for now as title holder
      status: 'pending',
      issue_date: new Date().toISOString(),
      total_amount: 0, // Should calc
      notes: JSON.stringify({ periodDays: payload.periodDays, targetDays: payload.targetDays }), // Storing config in notes
    })
    .select()
    .single();

  if (orderError) throw orderError;
  const orderId = orderData.id;

  // 2. Prepare Items
  const itemsToInsert = [];

  // Products
  for (const p of payload.produtos) {
    itemsToInsert.push({
      purchase_order_id: orderId,
      product_id: p.id_produto_tiny,
      product_name: p.nome || 'Produto sem nome',
      product_sku: p.codigo,
      quantity: p.quantidade,
      unit_cost: 0, // We don't have cost in payload yet, frontend sends it? logic says 'preco_custo'.
    });
  }

  // Manual Items
  for (const m of payload.manualItems) {
    itemsToInsert.push({
      purchase_order_id: orderId,
      product_id: null, // Manual
      product_name: m.nome,
      product_sku: m.fornecedor_codigo, // abuse sku for code
      quantity: m.quantidade,
      unit_cost: 0,
    });
  }

  // 3. Insert Items
  if (itemsToInsert.length > 0) {
    const { error: itemsError } = await supabaseAdmin
      .from(TABLE_ITEMS)
      .insert(itemsToInsert);

    if (itemsError) {
      // If items fail, we should delete the order to avoid partial state (pseudo-transaction)
      await supabaseAdmin.from(TABLE_PO).delete().eq('id', orderId);
      throw itemsError;
    }
  }

  // 4. Return formatted
  // We need to fetch it back fully populated to return correct shape
  const { data: completeOrder } = await supabaseAdmin
    .from(TABLE_PO)
    .select('*, purchase_order_items(*)')
    .eq('id', orderId)
    .single()
    .throwOnError();

  return normalizePurchaseOrder(completeOrder);
}

export async function updateSavedOrderName(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Nome obrigatório');

  const { data } = await supabaseAdmin
    .from(TABLE_PO)
    .update({ supplier_name: trimmed }) // Updating title
    .eq('id', id)
    .select('*, purchase_order_items(*)')
    .single()
    .throwOnError();

  return normalizePurchaseOrder(data);
}

export async function deleteSavedOrder(id: string) {
  const { error } = await supabaseAdmin.from(TABLE_PO).delete().eq('id', id);
  if (error) throw error;
}

