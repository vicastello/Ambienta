// Quick script to add the column
import { supabaseAdmin } from './lib/supabaseAdmin';

async function addColumn() {
  try {
    // Try to insert a valor_frete value to see if column exists
    // If it doesn't exist, we'll get an error
    const { error } = await supabaseAdmin
      .from('tiny_orders')
      .update({ valor_frete: 0 })
      .eq('id', -1);
      
    if (error && error.message.includes('valor_frete')) {
      console.log('Column valor_frete does not exist, needs to be created manually in Supabase Dashboard');
      console.log('\nRun this SQL in Supabase > SQL Editor:');
      console.log('ALTER TABLE tiny_orders ADD COLUMN IF NOT EXISTS valor_frete NUMERIC(14,2) DEFAULT 0;');
    } else {
      console.log('✓ valor_frete column already exists or other error:', error?.message);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

addColumn();
