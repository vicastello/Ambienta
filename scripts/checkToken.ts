import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

(async () => {
  const { data, error } = await supabase
    .from('tiny_tokens')
    .select('id, access_token, created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  
  if (error) {
    console.error('Erro:', error);
  } else {
    console.log('Token encontrado:', data?.[0] ? 'SIM' : 'NÃO');
    if (data?.[0]) {
      console.log('ID:', data[0].id);
      console.log('Created:', data[0].created_at);
      console.log('Token (primeiros 20 chars):', data[0].access_token?.substring(0, 20));
    }
  }
})();
