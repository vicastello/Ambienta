-- Finalização de índices e políticas para embalagens
-- Seguro para re-execução

-- Índices
CREATE INDEX IF NOT EXISTS idx_embalagens_nome ON public.embalagens(nome);
CREATE INDEX IF NOT EXISTS idx_embalagens_created_at ON public.embalagens(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_produto_embalagens_embalagem_id ON public.produto_embalagens(embalagem_id);

-- Garantir RLS habilitado
ALTER TABLE public.embalagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produto_embalagens ENABLE ROW LEVEL SECURITY;

-- (Re)criar políticas para embalagens
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='embalagens' AND policyname='Permitir leitura de embalagens') THEN
    EXECUTE 'DROP POLICY "Permitir leitura de embalagens" ON public.embalagens';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='embalagens' AND policyname='Permitir inserção de embalagens') THEN
    EXECUTE 'DROP POLICY "Permitir inserção de embalagens" ON public.embalagens';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='embalagens' AND policyname='Permitir atualização de embalagens') THEN
    EXECUTE 'DROP POLICY "Permitir atualização de embalagens" ON public.embalagens';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='embalagens' AND policyname='Permitir exclusão de embalagens') THEN
    EXECUTE 'DROP POLICY "Permitir exclusão de embalagens" ON public.embalagens';
  END IF;
END $$;

CREATE POLICY "Permitir leitura de embalagens" ON public.embalagens FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de embalagens" ON public.embalagens FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de embalagens" ON public.embalagens FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de embalagens" ON public.embalagens FOR DELETE USING (true);

-- (Re)criar políticas para produto_embalagens
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='produto_embalagens' AND policyname='Permitir leitura de produto_embalagens') THEN
    EXECUTE 'DROP POLICY "Permitir leitura de produto_embalagens" ON public.produto_embalagens';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='produto_embalagens' AND policyname='Permitir inserção de produto_embalagens') THEN
    EXECUTE 'DROP POLICY "Permitir inserção de produto_embalagens" ON public.produto_embalagens';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='produto_embalagens' AND policyname='Permitir atualização de produto_embalagens') THEN
    EXECUTE 'DROP POLICY "Permitir atualização de produto_embalagens" ON public.produto_embalagens';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='produto_embalagens' AND policyname='Permitir exclusão de produto_embalagens') THEN
    EXECUTE 'DROP POLICY "Permitir exclusão de produto_embalagens" ON public.produto_embalagens';
  END IF;
END $$;

CREATE POLICY "Permitir leitura de produto_embalagens" ON public.produto_embalagens FOR SELECT USING (true);
CREATE POLICY "Permitir inserção de produto_embalagens" ON public.produto_embalagens FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir atualização de produto_embalagens" ON public.produto_embalagens FOR UPDATE USING (true);
CREATE POLICY "Permitir exclusão de produto_embalagens" ON public.produto_embalagens FOR DELETE USING (true);
