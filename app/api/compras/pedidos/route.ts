import { NextRequest, NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import {
  createSavedOrder,
  listSavedOrders,
} from '@/src/repositories/comprasSavedOrdersRepository';
import type { SavedOrderManualItem, SavedOrderProduct } from '@/src/types/compras';

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const sanitizeProduto = (input: unknown): SavedOrderProduct | null => {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as Partial<SavedOrderProduct>;
  const id = Number(candidate.id_produto_tiny);
  if (!Number.isFinite(id)) return null;
  const quantidade = Number(candidate.quantidade);
  if (!Number.isFinite(quantidade) || quantidade <= 0) return null;
  return {
    id_produto_tiny: id,
    nome: typeof candidate.nome === 'string' ? candidate.nome : candidate.nome ?? null,
    codigo: typeof candidate.codigo === 'string' ? candidate.codigo : candidate.codigo ?? null,
    fornecedor_nome:
      typeof candidate.fornecedor_nome === 'string' ? candidate.fornecedor_nome : candidate.fornecedor_nome ?? null,
    fornecedor_codigo:
      typeof candidate.fornecedor_codigo === 'string'
        ? candidate.fornecedor_codigo
        : candidate.fornecedor_codigo ?? null,
    gtin: typeof candidate.gtin === 'string' ? candidate.gtin : candidate.gtin ?? null,
    quantidade: Math.max(1, Math.round(quantidade)),
    observacao: typeof candidate.observacao === 'string' ? candidate.observacao : candidate.observacao ?? null,
  };
};

const sanitizeManualItem = (input: unknown): SavedOrderManualItem | null => {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as Partial<SavedOrderManualItem>;
  const id = Number(candidate.id);
  const quantidade = Number(candidate.quantidade);
  if (!Number.isFinite(id) || !Number.isFinite(quantidade) || quantidade <= 0) return null;
  const fornecedorCodigo = typeof candidate.fornecedor_codigo === 'string' ? candidate.fornecedor_codigo.trim() : '';
  const nome = typeof candidate.nome === 'string' ? candidate.nome.trim() : '';
  if (!fornecedorCodigo || !nome) return null;
  return {
    id,
    nome,
    fornecedor_codigo: fornecedorCodigo,
    quantidade: Math.max(1, Math.round(quantidade)),
    observacao: typeof candidate.observacao === 'string' ? candidate.observacao : '',
  };
};

export async function GET() {
  try {
    const orders = await listSavedOrders();
    return NextResponse.json({ orders });
  } catch (error) {
    const message = getErrorMessage(error) ?? 'Erro ao listar pedidos salvos';
    console.error('[API Compras/Pedidos][GET]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawName = typeof body.name === 'string' ? body.name.trim() : '';
    if (!rawName) {
      return NextResponse.json({ error: 'O nome do pedido é obrigatório.' }, { status: 400 });
    }

    const periodDays = clamp(Number(body.periodDays) || 60, 15, 180);
    const targetDays = clamp(Number(body.targetDays) || 15, 15, 180);
    const produtos = Array.isArray(body.produtos)
      ? (body.produtos.map(sanitizeProduto).filter(Boolean) as SavedOrderProduct[])
      : [];
    const manualItems = Array.isArray(body.manualItems)
      ? (body.manualItems.map(sanitizeManualItem).filter(Boolean) as SavedOrderManualItem[])
      : [];

    if (!produtos.length && !manualItems.length) {
      return NextResponse.json(
        { error: 'Selecione pelo menos um item antes de salvar o pedido.' },
        { status: 400 }
      );
    }

    const order = await createSavedOrder({
      name: rawName,
      periodDays,
      targetDays,
      produtos,
      manualItems,
    });

    return NextResponse.json({ order });
  } catch (error) {
    const message = getErrorMessage(error) ?? 'Erro ao salvar pedido';
    console.error('[API Compras/Pedidos][POST]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
