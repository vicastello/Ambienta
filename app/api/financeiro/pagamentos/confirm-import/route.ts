import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Confirm import endpoint
 * Takes a preview session and saves all payments to the database
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { sessionId, payments: bodyPayments } = body;

        if (!sessionId) {
            return NextResponse.json(
                { error: 'Session ID obrigatório' },
                { status: 400 }
            );
        }

        console.log('[ConfirmImport] Starting import for session:', sessionId);

        // 1. Fetch session data
        const { data: session, error: sessionError } = await supabaseAdmin
            .from('payment_import_sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

        if (sessionError || !session) {
            return NextResponse.json(
                { error: 'Sessão de preview não encontrada' },
                { status: 404 }
            );
        }

        if (session.status === 'confirmed') {
            return NextResponse.json(
                { error: 'Esta sessão já foi confirmada' },
                { status: 400 }
            );
        }

        const payments = bodyPayments || (session.parsed_data as any[]);
        console.log('[ConfirmImport] Payments source:', {
            fromBody: !!bodyPayments,
            bodyLength: bodyPayments?.length || 0,
            parsedDataLength: (session.parsed_data as any[])?.length || 0,
            paymentsLength: payments?.length || 0,
        });

        if (!payments || payments.length === 0) {
            return NextResponse.json(
                { error: 'Nenhum pagamento para importar' },
                { status: 400 }
            );
        }

        // 2. Create upload batch
        const { data: batch, error: batchError } = await supabaseAdmin
            .from('payment_upload_batches')
            .insert({
                marketplace: session.marketplace,
                filename: `Import from session ${sessionId}`,
                status: 'processing',
                date_range_start: session.date_range_start,
                date_range_end: session.date_range_end,
                payments_count: payments.length,
            })
            .select()
            .single();

        if (batchError || !batch) {
            console.error('[ConfirmImport] Error creating batch:', batchError);
            return NextResponse.json(
                { error: 'Erro ao criar batch de importação' },
                { status: 500 }
            );
        }

        // 3. Process payments
        let rowsProcessed = 0;
        let rowsMatched = 0;
        const transactionGroups = new Map<string, any>();

        for (const payment of payments) {
            try {
                // Detect expense category from transaction description/type
                let expenseCategory = null;
                if (payment.isExpense) {
                    const desc = (payment.transactionDescription || payment.transactionType || '').toLowerCase();
                    if (desc.includes('anúncio') || desc.includes('anuncio') || desc.includes('publicidade')) {
                        expenseCategory = 'anuncios';
                    } else if (desc.includes('taxa') || desc.includes('tarifa')) {
                        expenseCategory = 'taxas';
                    } else if (desc.includes('frete')) {
                        expenseCategory = 'frete';
                    } else if (desc.includes('comissão') || desc.includes('comissao')) {
                        expenseCategory = 'comissao';
                    } else if (desc.includes('reembolso')) {
                        expenseCategory = 'reembolso';
                    } else {
                        expenseCategory = 'outros';
                    }
                }

                // Insert or update marketplace_payment
                const { data: insertedPayment, error: insertError } = await supabaseAdmin
                    .from('marketplace_payments')
                    .upsert({
                        marketplace: session.marketplace,
                        marketplace_order_id: payment.marketplaceOrderId,
                        upload_batch_id: batch.id,
                        payment_date: payment.paymentDate,
                        settlement_date: payment.settlementDate,
                        gross_amount: payment.grossAmount,
                        net_amount: payment.netAmount,
                        fees: payment.fees,
                        discount: payment.discount,
                        status: payment.status,
                        payment_method: payment.paymentMethod,
                        transaction_type: payment.transactionType,
                        transaction_description: payment.transactionDescription,
                        balance_after: payment.balanceAfter,
                        is_adjustment: payment.isAdjustment,
                        is_refund: payment.isRefund,
                        is_expense: payment.isExpense || false,
                        expense_category: expenseCategory,
                        tags: payment.tags,
                        tiny_order_id: payment.tinyOrderId,
                        matched_at: payment.tinyOrderId ? new Date().toISOString() : null,
                        match_confidence: payment.tinyOrderId ? 'exact' : null,
                        raw_data: payment.rawData,
                        fee_overrides: payment.fee_overrides,
                    }, {
                        onConflict: 'marketplace,marketplace_order_id',
                    })
                    .select()
                    .single();

                if (insertError) {
                    console.error('[ConfirmImport] Error inserting payment:', insertError);
                    continue;
                }

                rowsProcessed++;
                if (payment.tinyOrderId) {
                    rowsMatched++;

                    // Update tiny_orders if linked
                    const updateData: any = {
                        payment_received: true,
                        payment_received_at: payment.paymentDate || new Date().toISOString(),
                        marketplace_payment_id: insertedPayment.id,
                    };

                    // Also persist calculated fees if they came from the preview
                    if (payment.tinyOrderInfo?.valor_esperado !== undefined) {
                        updateData.valor_esperado_liquido = payment.tinyOrderInfo.valor_esperado;
                        updateData.diferenca_valor = payment.netAmount - payment.tinyOrderInfo.valor_esperado;
                        updateData.fees_breakdown = payment.tinyOrderInfo.fees_breakdown;
                        updateData.fee_overrides = payment.fee_overrides;
                    }

                    await supabaseAdmin
                        .from('tiny_orders')
                        .update(updateData)
                        .eq('id', payment.tinyOrderId);
                }

                // Track transaction groups
                if (payment.matchStatus === 'multiple_entries') {
                    const groupKey = `${session.marketplace}:${payment.marketplaceOrderId}`;
                    if (!transactionGroups.has(groupKey)) {
                        transactionGroups.set(groupKey, {
                            marketplace_order_id: payment.marketplaceOrderId,
                            marketplace: session.marketplace,
                            net_balance: payment.netBalance || 0,
                            has_adjustments: payment.isAdjustment,
                            has_refunds: payment.isRefund,
                            transaction_count: 1,
                            tags: payment.tags,
                        });
                    } else {
                        const group = transactionGroups.get(groupKey);
                        group.transaction_count++;
                        group.has_adjustments = group.has_adjustments || payment.isAdjustment;
                        group.has_refunds = group.has_refunds || payment.isRefund;
                        group.tags = [...new Set([...group.tags, ...payment.tags])];
                    }
                }
            } catch (error) {
                console.error('[ConfirmImport] Error processing payment:', error);
            }
        }

        // 4. Create transaction groups
        for (const [_, groupData] of transactionGroups) {
            await supabaseAdmin
                .from('payment_transaction_groups')
                .upsert(groupData, {
                    onConflict: 'marketplace,marketplace_order_id',
                });
        }

        // 5. Update batch status
        await supabaseAdmin
            .from('payment_upload_batches')
            .update({
                status: 'completed',
                rows_processed: rowsProcessed,
                rows_matched: rowsMatched,
            })
            .eq('id', batch.id);

        // 6. Update session status
        await supabaseAdmin
            .from('payment_import_sessions')
            .update({
                status: 'confirmed',
                batch_id: batch.id,
            })
            .eq('id', sessionId);

        return NextResponse.json({
            success: true,
            batchId: batch.id,
            rowsProcessed,
            rowsMatched,
            transactionGroupsCreated: transactionGroups.size,
            matchRate: rowsProcessed > 0
                ? ((rowsMatched / rowsProcessed) * 100).toFixed(1) + '%'
                : '0%',
        });

    } catch (error) {
        console.error('[ConfirmImport] Unexpected error:', error);
        return NextResponse.json(
            { error: 'Erro interno do servidor' },
            { status: 500 }
        );
    }
}
