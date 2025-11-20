-- VERIFICAR STATUS DA SINCRONIZAÇÃO DO TINY ORDERS

-- 1. Verificar total de pedidos na tabela
SELECT 
  COUNT(*) as total_pedidos,
  MIN(last_sync_check) as primeira_sync,
  MAX(last_sync_check) as ultima_sync,
  NOW() - MAX(last_sync_check) as tempo_desde_ultima_sync
FROM tiny_orders;

-- 2. Verificar quantidade de pedidos por situação
SELECT 
  situacao,
  COUNT(*) as quantidade
FROM tiny_orders
GROUP BY situacao
ORDER BY quantidade DESC;

-- 3. Verificar pedidos mais recentes (últimos 10)
SELECT 
  numero_pedido,
  id_tiny,
  situacao,
  data_criacao,
  valor,
  last_sync_check,
  NOW() - last_sync_check as tempo_atras
FROM tiny_orders
ORDER BY last_sync_check DESC
LIMIT 10;

-- 4. Verificar status do token
SELECT 
  id,
  access_token,
  token_type,
  expires_at,
  NOW() as hora_atual,
  CASE 
    WHEN expires_at > NOW() THEN 'VÁLIDO'
    ELSE 'EXPIRADO'
  END as status_token
FROM tiny_tokens
WHERE id = 1;

-- 5. Verificar se a função existe
SELECT 
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines
WHERE routine_name = 'sync_tiny_orders_now'
AND routine_schema = 'public';

-- 6. Verificar cron jobs
SELECT 
  jobid,
  jobname,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job
WHERE jobname LIKE '%sync%' OR jobname LIKE '%efficient%'
ORDER BY jobname;

-- 7. Verificar últimas execuções do cron (se houver logs)
SELECT 
  jobid,
  jobname,
  start_time,
  end_time,
  CASE 
    WHEN end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (end_time - start_time))
    ELSE NULL 
  END as duracao_segundos,
  status
FROM cron.job_run_details
WHERE jobname LIKE '%sync%' OR jobname LIKE '%efficient%'
ORDER BY start_time DESC
LIMIT 20;

-- 8. Executar a função agora para testar
SELECT sync_tiny_orders_now() as resultado;
