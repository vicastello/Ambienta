// API route for uploading marketplace payment extracts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { parsePaymentFile, type ParsedPayment } from '@/lib/paymentParsers';

export const config = {
    api: {
        bodyParser: false,
    },
};

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const marketplace = formData.get('marketplace') as 'magalu' | 'mercado_livre' | 'shopee';

        console.log('[PaymentUpload] Start:', { marketplace, filename: file?.name });

        if (!file) {
            return NextResponse.json({ error: 'Arquivo não fornecido' }, { status: 400 });
        }

        if (!marketplace) {
            return NextResponse.json({ error: 'Marketplace não especificado' }, { status: 400 });
        }

        // 1. Create upload batch
        const { data: batch, error: batchError } = await supabaseAdmin
            .from('payment_upload_batches')
            .insert({
                marketplace,
                filename: file.name,
                status: 'processing',
            })
            .select()
            .single();

        if (batchError || !batch) {
            console.error('[PaymentUpload] Error creating batch:', batchError);
            return NextResponse.json({
                success: false,
                errors: ['Erro ao criar batch no banco de dados: ' + (batchError?.message || 'desconhecido')]
            }, { status: 500 });
        }

        console.log('[PaymentUpload] Batch created:', batch.id);

        // 2. Parse file
        const parseResult = await parsePaymentFile(file, marketplace);

        console.log('[PaymentUpload] Parse result:', {
            success: parseResult.success,
            paymentsCount: parseResult.payments.length,
            errorsCount: parseResult.errors.length,
        });

        if (!parseResult.success) {
            await supabaseAdmin
                .from('payment_upload_batches')
                .update({
                    status: 'failed',
                    error_message: parseResult.errors.join('; '),
                    rows_failed: parseResult.errors.length,
                })
                .eq('id', batch.id);

            return NextResponse.json({
                success: false,
                batchId: batch.id,
                errors: parseResult.errors,
            }, { status: 400 });
        }

        // 3. Process payments with deduplication
        let rowsProcessed = 0;
        let rowsSkipped = 0;
        let rowsMatched = 0;
        const unmatchedOrders: string[] = [];

        for (const payment of parseResult.payments) {
            rowsProcessed++;

            // Check for duplicate
            const { data: existing } = await supabaseAdmin
                .from('marketplace_payments')
                .select('id')
                .eq('marketplace', marketplace)
                .eq('marketplace_order_id', payment.marketplaceOrderId)
                .single();

            if (existing) {
                rowsSkipped++;
                continue;
            }

            // Insert payment
            const { data: insertedPayment, error: insertError } = await supabaseAdmin
                .from('marketplace_payments')
                .insert({
                    marketplace,
                    upload_batch_id: batch.id,
                    marketplace_order_id: payment.marketplaceOrderId,
                    payment_date: payment.paymentDate,
                    settlement_date: payment.settlementDate,
                    gross_amount: payment.grossAmount,
                    net_amount: payment.netAmount,
                    fees: payment.fees,
                    discount: payment.discount,
                    status: payment.status,
                    payment_method: payment.paymentMethod,
                    raw_data: payment.rawData,
                })
                .select()
                .single();

            if (insertError) {
                console.error('[PaymentUpload] Error inserting payment:', insertError);
                continue;
            }

            // 4. Try to match with Tiny order
            const matched = await matchPaymentWithTinyOrder(
                insertedPayment.id,
                marketplace,
                payment.marketplaceOrderId
            );

            if (matched) {
                rowsMatched++;
            } else {
                unmatchedOrders.push(payment.marketplaceOrderId);
            }
        }

        // 5. Update batch stats
        await supabaseAdmin
            .from('payment_upload_batches')
            .update({
                status: 'completed',
                rows_processed: rowsProcessed,
                rows_matched: rowsMatched,
                rows_skipped: rowsSkipped,
            })
            .eq('id', batch.id);

        return NextResponse.json({
            success: true,
            batchId: batch.id,
            rowsProcessed,
            rowsMatched,
            rowsSkipped,
            unmatchedOrders,
            matchRate: rowsProcessed > 0 ? (rowsMatched / rowsProcessed * 100).toFixed(1) + '%' : '0%',
        });

    } catch (error) {
        console.error('[PaymentUpload] Unexpected error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        return NextResponse.json({
            success: false,
            errors: ['Erro interno do servidor: ' + errorMessage],
        }, { status: 500 });
    }
}

/**
 * Match payment with Tiny order based on marketplace
 */
async function matchPaymentWithTinyOrder(
    paymentId: string,
    marketplace: string,
    marketplaceOrderId: string
): Promise<boolean> {
    console.log('[MatchPayment] Attempting match:', { paymentId, marketplace, marketplaceOrderId });

    let tinyOrderId: number | null = null;

    // Match based on marketplace using marketplace_order_links table
    if (marketplace === 'magalu') {
        const { data, error } = await supabaseAdmin
            .from('marketplace_order_links')
            .select('tiny_order_id')
            .eq('marketplace', 'magalu')
            .eq('marketplace_order_id', marketplaceOrderId)
            .single();

        console.log('[MatchPayment] Magalu query result:', { data, error, marketplaceOrderId });
        tinyOrderId = data?.tiny_order_id;
    } else if (marketplace === 'mercado_livre') {
        const { data } = await supabaseAdmin
            .from('marketplace_order_links')
            .select('tiny_order_id')
            .eq('marketplace', 'mercado_livre')
            .eq('marketplace_order_id', marketplaceOrderId)
            .single();
        tinyOrderId = data?.tiny_order_id;
    } else if (marketplace === 'shopee') {
        const { data } = await supabaseAdmin
            .from('marketplace_order_links')
            .select('tiny_order_id')
            .eq('marketplace', 'shopee')
            .eq('marketplace_order_id', marketplaceOrderId)
            .single();
        tinyOrderId = data?.tiny_order_id;
    }

    console.log('[MatchPayment] Resolved tiny_order_id:', tinyOrderId);

    if (!tinyOrderId) {
        console.log('[MatchPayment] No match found, returning false');
        return false;
    }

    // Update payment record
    const { error: paymentUpdateError } = await supabaseAdmin
        .from('marketplace_payments')
        .update({
            tiny_order_id: tinyOrderId,
            matched_at: new Date().toISOString(),
            match_confidence: 'exact',
        })
        .eq('id', paymentId);

    console.log('[MatchPayment] Payment updated:', { paymentId, tinyOrderId, error: paymentUpdateError });

    // Update tiny_orders
    const { data: payment } = await supabaseAdmin
        .from('marketplace_payments')
        .select('payment_date')
        .eq('id', paymentId)
        .single();

    const { error: tinyOrderUpdateError } = await supabaseAdmin
        .from('tiny_orders')
        .update({
            payment_received: true,
            payment_received_at: payment?.payment_date || new Date().toISOString(),
            marketplace_payment_id: paymentId,
        })
        .eq('id', tinyOrderId);

    console.log('[MatchPayment] Tiny order updated:', { tinyOrderId, error: tinyOrderUpdateError });

    return true;
}

// GET endpoint for fetching upload history
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const limit = parseInt(searchParams.get('limit') || '20');
        const marketplace = searchParams.get('marketplace');

        let query = supabaseAdmin
            .from('payment_upload_batches')
            .select('*')
            .order('uploaded_at', { ascending: false })
            .limit(limit);

        if (marketplace) {
            query = query.eq('marketplace', marketplace);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[PaymentUpload] Error fetching batches:', error);
            return NextResponse.json({ error: 'Erro ao buscar histórico' }, { status: 500 });
        }

        return NextResponse.json({ batches: data || [] });
    } catch (error) {
        console.error('[PaymentUpload] Unexpected error:', error);
        return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
}
