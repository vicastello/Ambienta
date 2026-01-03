import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { syncShopeeEscrowForOrders } from '@/lib/shopeeEscrowSync';

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
                let expenseCategory = payment.expenseCategory || null;
                if (payment.isExpense && !expenseCategory) {
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

                // On-Demand Sync: If not matched in preview, try to fetch from Tiny now
                let tinyOrderId = payment.tinyOrderId;
                let matchConfidence = payment.tinyOrderId ? 'exact' : null;
                let matchedAt = payment.tinyOrderId ? new Date().toISOString() : null;

                // Helper to extract base order ID (strip suffixes like _AJUSTE, _AJUSTE_2, _REEMBOLSO)
                const getBaseOrderId = (orderId: string): string => {
                    return orderId
                        .replace(/_(?:AJUSTE|REEMBOLSO|RETIRADA|FRETE|COMISSAO)(?:_?\d+)?$/i, '')
                        .replace(/_\d+$/, '');
                };

                if (!tinyOrderId) {
                    const baseOrderId = getBaseOrderId(payment.marketplaceOrderId);
                    const isAdjustment = baseOrderId !== payment.marketplaceOrderId;

                    const { data: orderLink } = await supabaseAdmin
                        .from('marketplace_order_links')
                        .select('tiny_order_id')
                        .eq('marketplace', session.marketplace)
                        .eq('marketplace_order_id', baseOrderId)
                        .maybeSingle();

                    if (orderLink?.tiny_order_id) {
                        tinyOrderId = orderLink.tiny_order_id;
                        matchConfidence = 'derived';
                        matchedAt = new Date().toISOString();
                        console.log(`[ConfirmImport] Linked ${payment.marketplaceOrderId} via marketplace_order_links -> ID ${tinyOrderId}`);
                    } else if (isAdjustment) {
                        // First try to find the parent payment's tiny_order_id
                        const { data: parentPayment } = await supabaseAdmin
                            .from('marketplace_payments')
                            .select('tiny_order_id')
                            .eq('marketplace', session.marketplace)
                            .eq('marketplace_order_id', baseOrderId)
                            .not('tiny_order_id', 'is', null)
                            .maybeSingle();

                        if (parentPayment?.tiny_order_id) {
                            tinyOrderId = parentPayment.tiny_order_id;
                            matchConfidence = 'derived';
                            matchedAt = new Date().toISOString();
                            console.log(`[ConfirmImport] Linked adjustment ${payment.marketplaceOrderId} to parent ${baseOrderId} -> ID ${tinyOrderId}`);
                        } else {
                            // Parent not found in payments, try to sync the base order
                            try {
                                const syncRes = await fetchAndSaveTinyOrder(baseOrderId, session.marketplace);
                                if (syncRes.success && syncRes.tinyOrderId) {
                                    tinyOrderId = syncRes.tinyOrderId;
                                    matchConfidence = 'derived';
                                    matchedAt = new Date().toISOString();
                                    console.log(`[ConfirmImport] Synced parent ${baseOrderId} for adjustment: ID ${tinyOrderId}`);
                                }
                            } catch (e) {
                                console.warn(`[ConfirmImport] Failed to sync parent for adjustment ${payment.marketplaceOrderId}`, e);
                            }
                        }
                    } else {
                        // Normal order - try to sync from Tiny
                        try {
                            const syncRes = await fetchAndSaveTinyOrder(baseOrderId, session.marketplace);
                            if (syncRes.success && syncRes.tinyOrderId) {
                                tinyOrderId = syncRes.tinyOrderId;
                                matchConfidence = 'high';
                                matchedAt = new Date().toISOString();
                                console.log(`[ConfirmImport] On-Demand Sync Success for ${payment.marketplaceOrderId}: ID ${tinyOrderId}`);
                            }
                        } catch (e) {
                            console.warn(`[ConfirmImport] Failed on-demand sync for ${payment.marketplaceOrderId}`, e);
                        }
                    }
                }

                // Check if payment already exists
                const { data: existingPayment } = await supabaseAdmin
                    .from('marketplace_payments')
                    .select('id')
                    .eq('marketplace', session.marketplace)
                    .eq('marketplace_order_id', payment.marketplaceOrderId)
                    .maybeSingle();

                let insertedPayment: any = null;
                let operationError: any = null;

                // Prepare payload with potentially updated tinyOrderId
                const payload = {
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
                    tiny_order_id: tinyOrderId,
                    matched_at: matchedAt,
                    match_confidence: matchConfidence,
                    raw_data: payment.rawData,
                    // fee_overrides: excluded (column missing)
                };

                if (existingPayment) {
                    // UPDATE
                    const { data, error } = await supabaseAdmin
                        .from('marketplace_payments')
                        .update(payload)
                        .eq('id', existingPayment.id)
                        .select()
                        .single();

                    if (error) operationError = error;
                    else insertedPayment = data;
                } else {
                    // INSERT (With FK Retry AND Re-Sync)
                    const { data, error } = await supabaseAdmin
                        .from('marketplace_payments')
                        .insert(payload)
                        .select()
                        .single();

                    if (error) {
                        // Check for FK violation
                        if (error.code === '23503') { // foreign_key_violation
                            console.warn(`[ConfirmImport] TinyOrder ID ${tinyOrderId} invalid. Trying RE-SYNC...`);

                            // Try to re-sync because ID might be stale/deleted
                            let newTinyId = null;
                            try {
                                const syncRes = await fetchAndSaveTinyOrder(payment.marketplaceOrderId, session.marketplace, true);
                                if (syncRes.success && syncRes.tinyOrderId) {
                                    newTinyId = syncRes.tinyOrderId;
                                }
                            } catch (e) {
                                console.warn(`[ConfirmImport] Re-sync failed`, e);
                            }

                            if (newTinyId) {
                                // Retry with New ID
                                const newPayload = {
                                    ...payload,
                                    tiny_order_id: newTinyId,
                                    matched_at: new Date().toISOString(),
                                    match_confidence: 'exact'
                                };
                                const { data: retryData, error: retryError } = await supabaseAdmin
                                    .from('marketplace_payments')
                                    .insert(newPayload)
                                    .select()
                                    .single();
                                if (retryError) operationError = retryError;
                                else insertedPayment = retryData;
                            } else {
                                // Final Fallback: Unlinked
                                const fallbackPayload = {
                                    ...payload,
                                    tiny_order_id: null,
                                    matched_at: null,
                                    match_confidence: null
                                };
                                const { data: fbData, error: fbError } = await supabaseAdmin
                                    .from('marketplace_payments')
                                    .insert(fallbackPayload)
                                    .select()
                                    .single();

                                if (fbError) operationError = fbError;
                                else insertedPayment = fbData;
                            }
                        } else {
                            operationError = error;
                        }
                    } else {
                        insertedPayment = data;
                    }
                }

                if (operationError) {
                    console.error('[ConfirmImport] Error upserting payment:', operationError);
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

        if (session.marketplace === 'shopee') {
            const normalizeOrderId = (orderId: string) =>
                orderId
                    .replace(/_(?:AJUSTE|REEMBOLSO|RETIRADA|FRETE|COMISSAO)(?:_?\d+)?$/i, '')
                    .replace(/_\d+$/, '');
            const orderSnList = Array.from(new Set(
                payments
                    .map((payment) => normalizeOrderId(payment.marketplaceOrderId))
                    .filter((orderSn: string) => orderSn.length > 0)
            ));

            try {
                const escrowResult = await syncShopeeEscrowForOrders(orderSnList, {
                    concurrency: 6,
                    delayMs: 120,
                });
                console.log('[ConfirmImport] Shopee escrow sync:', escrowResult);
            } catch (error) {
                console.error('[ConfirmImport] Shopee escrow sync failed:', error);
            }
        }

        // 7. Update rule metrics (match_count, last_applied_at, total_impact)
        const ruleMetrics = new Map<string, { count: number; impact: number }>();

        for (const payment of payments) {
            // Collect metrics from both matchedRuleNames and matchedRuleDetails
            const ruleIds = new Set<string>();

            // From matchedRuleDetails (more accurate)
            if (payment.matchedRuleDetails && Array.isArray(payment.matchedRuleDetails)) {
                for (const detail of payment.matchedRuleDetails) {
                    if (detail.ruleId && !detail.ruleId.startsWith('system_')) {
                        ruleIds.add(detail.ruleId);
                    }
                }
            }

            // Aggregate metrics per rule
            for (const ruleId of ruleIds) {
                const existing = ruleMetrics.get(ruleId) || { count: 0, impact: 0 };
                existing.count += 1;
                existing.impact += Math.abs(payment.netAmount || 0);
                ruleMetrics.set(ruleId, existing);
            }
        }

        // Update rule metrics in database
        if (ruleMetrics.size > 0) {
            const now = new Date().toISOString();
            for (const [ruleId, metrics] of ruleMetrics) {
                try {
                    // Use raw SQL for atomic increment
                    await supabaseAdmin.rpc('increment_rule_metrics', {
                        p_rule_id: ruleId,
                        p_match_count: metrics.count,
                        p_total_impact: metrics.impact,
                        p_last_applied_at: now,
                    }).then(() => {
                        console.log(`[ConfirmImport] Updated metrics for rule ${ruleId}: +${metrics.count} matches, +${metrics.impact.toFixed(2)} impact`);
                    }).catch(async () => {
                        // Fallback: simple update if RPC doesn't exist
                        const { data: existingRule } = await supabaseAdmin
                            .from('auto_rules')
                            .select('match_count, total_impact')
                            .eq('id', ruleId)
                            .single();

                        if (existingRule) {
                            await supabaseAdmin
                                .from('auto_rules')
                                .update({
                                    match_count: (existingRule.match_count || 0) + metrics.count,
                                    total_impact: (existingRule.total_impact || 0) + metrics.impact,
                                    last_applied_at: now,
                                })
                                .eq('id', ruleId);
                        }
                    });
                } catch (e) {
                    console.warn(`[ConfirmImport] Failed to update metrics for rule ${ruleId}:`, e);
                }
            }
        }

        return NextResponse.json({
            success: true,
            batchId: batch.id,
            rowsProcessed,
            rowsMatched,
            transactionGroupsCreated: transactionGroups.size,
            rulesApplied: ruleMetrics.size,
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
