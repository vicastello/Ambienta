import { NextRequest, NextResponse } from 'next/server';
import { deleteSavedOrder, updateSavedOrderName } from '@/src/repositories/comprasSavedOrdersRepository';
import { getErrorMessage } from '@/lib/errors';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const orderId = params.id;
  if (!orderId) {
    return NextResponse.json({ error: 'ID do pedido é obrigatório.' }, { status: 400 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Informe um nome válido.' }, { status: 400 });
    }

    const order = await updateSavedOrderName(orderId, name);
    return NextResponse.json({ order });
  } catch (error) {
    const message = getErrorMessage(error) ?? 'Erro ao atualizar o pedido';
    console.error('[API Compras/Pedidos][PATCH]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const orderId = params.id;
  if (!orderId) {
    return NextResponse.json({ error: 'ID do pedido é obrigatório.' }, { status: 400 });
  }

  try {
    await deleteSavedOrder(orderId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = getErrorMessage(error) ?? 'Erro ao remover o pedido';
    console.error('[API Compras/Pedidos][DELETE]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
