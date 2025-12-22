#!/bin/bash

# Sync all Shopee orders escrow data in batches of 100
# Uses the periodDays parameter to fetch all orders

echo "=== Syncing ALL Shopee Orders Escrow Data ==="
echo "This may take several minutes..."

# Get current status
echo ""
echo "Current status:"
curl -s http://localhost:3000/api/marketplaces/shopee/sync-escrow | jq .

total_updated=0
total_with_voucher=0
batch=1

# Keep running until no more orders to process
while true; do
    echo ""
    echo "=== Batch $batch ==="
    result=$(curl -s -X POST http://localhost:3000/api/marketplaces/shopee/sync-escrow \
        -H "Content-Type: application/json" \
        -d '{"periodDays": 180}')
    
    orders_updated=$(echo "$result" | jq -r '.data.ordersUpdated // 0')
    with_voucher=$(echo "$result" | jq -r '.data.ordersWithSellerVoucher // 0')
    
    echo "Updated: $orders_updated, With voucher: $with_voucher"
    
    total_updated=$((total_updated + orders_updated))
    total_with_voucher=$((total_with_voucher + with_voucher))
    
    # If no orders were updated, we're done
    if [ "$orders_updated" -eq 0 ]; then
        break
    fi
    
    batch=$((batch + 1))
    
    # Small delay between batches
    sleep 2
done

echo ""
echo "=== COMPLETE ==="
echo "Total orders updated: $total_updated"
echo "Total with seller voucher: $total_with_voucher"

# Final status
echo ""
echo "Final status:"
curl -s http://localhost:3000/api/marketplaces/shopee/sync-escrow | jq .
