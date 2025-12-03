set search_path = public;

-- Índice composto usado pelos filtros de relacionamento (tipo + codigo)
create index if not exists tiny_produtos_tipo_codigo_idx
	on tiny_produtos (tipo, codigo);

-- GIN para acelerar leituras do raw_payload durante o agrupamento de pais/filhos
create index if not exists tiny_produtos_raw_payload_gin_idx
	on tiny_produtos
	using gin (raw_payload jsonb_path_ops);
