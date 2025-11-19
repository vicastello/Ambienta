require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  try {
    const { data, error } = await supabase
      .from('tiny_auth')
      .select('*')
      .limit(1);

    if (error) {
      console.error('Erro:', error);
    } else {
      if (data && data.length > 0) {
        console.log('✅ Há token salvo no banco:');
        console.log('  - User ID:', data[0].user_id);
        console.log('  - Refresh token (primeiros 20 chars):', data[0].refresh_token?.substring(0, 20) + '...');
      } else {
        console.log('⚠️ Nenhum token encontrado no banco');
      }
    }
  } catch (err) {
    console.error('Erro ao conectar:', err.message);
  }
}

check();
