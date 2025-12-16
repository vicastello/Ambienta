-- Análise completa de sync do Tiny desde 15/11/2025

-- 1. Erros nos logs
SELECT 'ERROS DE SYNC' as tipo, created_at, message, meta
FROM sync_logs
WHERE level = 'error'
  AND created_at >= '2025-11-15'
ORDER BY created_at DESC
LIMIT 20;

-- 2. Últimos jobs de sync
SELECT 'JOBS DE SYNC' as tipo, created_at, status, params, error, total_orders, total_requests
FROM sync_jobs
ORDER BY created_at DESC
LIMIT 10;

-- 3. Últimos pedidos importados por data de criação no banco
SELECT 'ÚLTIMOS PEDIDOS (created_at)' as tipo, dataPedido, canal, count(*) as quantidade
FROM tiny_orders
GROUP BY dataPedido, canal
ORDER BY dataPedido DESC
LIMIT 30;

-- 4. Contagem de pedidos por data desde 15/11
SELECT 'CONTAGEM POR DATA' as tipo, dataPedido, count(*) as quantidade
FROM tiny_orders
WHERE dataPedido >= '2025-11-15'
GROUP BY dataPedido
ORDER BY dataPedido DESC;

-- 5. Verificar se há pedidos criados/atualizados recentemente no banco
SELECT 'PEDIDOS RECENTES NO BANCO' as tipo, 
       DATE(created_at) as data_insercao,
       count(*) as quantidade
FROM tiny_orders
WHERE created_at >= '2025-11-15'
GROUP BY DATE(created_at)
ORDER BY DATE(created_at) DESC;
