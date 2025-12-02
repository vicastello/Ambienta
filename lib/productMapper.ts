import type {
  TinyProdutoDetalhado,
  TinyProdutoListaItem,
  TinyEstoqueProduto,
} from '@/lib/tinyApi';
import type {
  TinyProdutosInsert,
  TinyProdutosRow,
} from '@/src/types/db-public';

const toLowerTrimmed = (value: string | null | undefined) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const toTitleCase = (value: string | null | undefined) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed
    .toLowerCase()
    .split(/\s+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
};

const firstText = (
  ...values: Array<string | number | null | undefined>
): string | null => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'number') {
      const trimmedNumber = String(value).trim();
      if (trimmedNumber.length) return trimmedNumber;
      continue;
    }
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length) return trimmed;
  }
  return null;
};

const toNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const firstNumber = (
  ...values: Array<string | number | null | undefined>
): number | null => {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
};

const firstDate = (
  ...values: Array<string | null | undefined>
): string | null => {
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const date = new Date(trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) continue;
    return date.toISOString();
  }
  return null;
};

type VariacoesSource = {
  tipo?: string | null;
  variacoes?: Array<{
    estoque?: {
      saldo?: number | string | null;
      disponivel?: number | string | null;
      reservado?: number | string | null;
      quantidade?: number | string | null;
    } | null;
  } | null>;
} | null;

export type VariacaoEstoqueTotals = {
  saldo: number | null;
  reservado: number | null;
  disponivel: number | null;
};

export function computeVariacaoEstoqueTotals(
  source: VariacoesSource
): VariacaoEstoqueTotals | null {
  if (!source || source.tipo !== 'V') return null;
  if (!Array.isArray(source.variacoes) || !source.variacoes.length) return null;

  let saldoSum = 0;
  let disponivelSum = 0;
  let reservadoSum = 0;
  let hasSaldo = false;
  let hasDisponivel = false;
  let hasReservado = false;

  for (const variacao of source.variacoes) {
    if (!variacao || typeof variacao !== 'object') continue;
    const estoque: Record<string, unknown> =
      (variacao as { estoque?: Record<string, unknown> | null })?.estoque ?? {};

    const saldoValue = firstNumber(
      estoque?.saldo as any,
      estoque?.disponivel as any,
      estoque?.quantidade as any
    );
    if (saldoValue !== null) {
      saldoSum += saldoValue;
      hasSaldo = true;
    }

    const disponivelValue = firstNumber(
      estoque?.disponivel as any,
      estoque?.saldo as any,
      estoque?.quantidade as any
    );
    if (disponivelValue !== null) {
      disponivelSum += disponivelValue;
      hasDisponivel = true;
    }

    const reservadoValue = toNumber(estoque?.reservado as any);
    if (reservadoValue !== null) {
      reservadoSum += reservadoValue;
      hasReservado = true;
    }
  }

  if (!hasSaldo && !hasDisponivel && !hasReservado) {
    return null;
  }

  return {
    saldo: hasSaldo ? saldoSum : null,
    disponivel: hasDisponivel ? disponivelSum : null,
    reservado: hasReservado ? reservadoSum : null,
  };
}

export type ProdutoCadastroSources = {
  resumo?: TinyProdutoListaItem | null;
  detalhe?: TinyProdutoDetalhado | null;
  estoque?: TinyEstoqueProduto | null;
  registroAtual?: Partial<TinyProdutosRow> | null;
};

export function buildProdutoUpsertPayload({
  resumo,
  detalhe,
  estoque,
  registroAtual,
}: ProdutoCadastroSources): TinyProdutosInsert {
  const produtoId = detalhe?.id ?? resumo?.id ?? registroAtual?.id_produto_tiny;
  if (!produtoId) {
    throw new Error('Produto sem identificador do Tiny');
  }

  const codigo =
    firstText(
      (detalhe as any)?.sku,
      detalhe?.codigo,
      resumo?.sku,
      (resumo as any)?.codigo,
      registroAtual?.codigo,
      String(produtoId)
    ) ?? `ID-${produtoId}`;

  const nome =
    firstText(
      detalhe?.nome,
      (resumo as any)?.nome,
      resumo?.descricao,
      detalhe?.descricao,
      registroAtual?.nome
    ) ?? `Produto ${produtoId}`;

  const preco = firstNumber(
    detalhe?.precos?.preco,
    resumo?.precos?.preco,
    registroAtual?.preco
  );

  const precoPromocional = firstNumber(
    detalhe?.precos?.precoPromocional,
    resumo?.precos?.precoPromocional,
    registroAtual?.preco_promocional
  );

  const variacaoEstoque = computeVariacaoEstoqueTotals(detalhe as VariacoesSource);

  const baseSaldo = firstNumber(
    detalhe?.estoque?.saldo,
    estoque?.saldo,
    (resumo as any)?.estoques?.saldo,
    registroAtual?.saldo
  );
  const saldo = variacaoEstoque?.saldo ?? baseSaldo;

  const baseReservado = firstNumber(
    detalhe?.estoque?.reservado,
    estoque?.reservado,
    (resumo as any)?.estoques?.reservado,
    registroAtual?.reservado
  );
  const reservado = variacaoEstoque?.reservado ?? baseReservado;

  const baseDisponivel = firstNumber(
    detalhe?.estoque?.disponivel,
    estoque?.disponivel,
    (resumo as any)?.estoques?.disponivel,
    registroAtual?.disponivel,
    baseSaldo
  );
  const disponivel =
    variacaoEstoque?.disponivel ?? baseDisponivel ?? variacaoEstoque?.saldo ?? saldo;

  const unidade = firstText(detalhe?.unidade, resumo?.unidade, registroAtual?.unidade);
  const situacao = firstText(detalhe?.situacao, resumo?.situacao, registroAtual?.situacao);
  const tipo = firstText(detalhe?.tipo, resumo?.tipo, registroAtual?.tipo);
  const gtin = firstText(detalhe?.gtin, resumo?.gtin, registroAtual?.gtin);
  const descricao = firstText(detalhe?.descricao, registroAtual?.descricao);
  const ncm = firstText(detalhe?.ncm, registroAtual?.ncm);
  const origem = firstText(detalhe?.origem, registroAtual?.origem);
  const peso_liquido = firstNumber(
    detalhe?.dimensoes?.pesoLiquido,
    registroAtual?.peso_liquido
  );
  const peso_bruto = firstNumber(
    detalhe?.dimensoes?.pesoBruto,
    registroAtual?.peso_bruto
  );
  const fornecedorPrincipal = Array.isArray(detalhe?.fornecedores)
    ? detalhe?.fornecedores?.find((fornecedor) => {
        const nomeValido = typeof fornecedor?.nome === 'string' && fornecedor.nome.trim().length > 0;
        const codigoValido = typeof fornecedor?.codigoProdutoNoFornecedor === 'string' && fornecedor.codigoProdutoNoFornecedor.trim().length > 0;
        return nomeValido || codigoValido;
      })
    : undefined;

  const fornecedor_codigo = firstText(
    fornecedorPrincipal?.codigoProdutoNoFornecedor,
    registroAtual?.fornecedor_codigo
  );

  const fornecedor_nome = toTitleCase(
    firstText(fornecedorPrincipal?.nome, registroAtual?.fornecedor_nome)
  );
  const embalagem_qtd = firstNumber(
    (detalhe as any)?.embalagem?.quantidade,
    registroAtual?.embalagem_qtd
  );
  const marca = firstText((detalhe as any)?.marca, registroAtual?.marca);
  const categoria = firstText(
    (detalhe as any)?.categoria,
    (detalhe as any)?.grupo,
    registroAtual?.categoria
  );
  const imagem_url = firstText(
    detalhe?.anexos?.find?.((a) => a?.url)?.url,
    registroAtual?.imagem_url
  );
  const data_criacao_tiny = firstDate(
    detalhe?.dataCriacao,
    resumo?.dataCriacao,
    registroAtual?.data_criacao_tiny
  );
  const data_atualizacao_tiny = firstDate(
    detalhe?.dataAlteracao,
    resumo?.dataAlteracao,
    registroAtual?.data_atualizacao_tiny
  );

  return {
    id_produto_tiny: produtoId,
    codigo,
    nome,
    unidade,
    preco,
    preco_promocional: precoPromocional,
    saldo,
    reservado,
    disponivel,
    situacao,
    tipo,
    gtin,
    descricao,
    ncm,
    origem,
    peso_liquido,
    peso_bruto,
    data_criacao_tiny,
    data_atualizacao_tiny,
    imagem_url,
    fornecedor_codigo,
    fornecedor_nome,
    embalagem_qtd,
    observacao_compras: registroAtual?.observacao_compras ?? null,
    marca,
    categoria,
    raw_payload: detalhe ?? registroAtual?.raw_payload ?? null,
  } satisfies TinyProdutosInsert;
}
