# Guia de Estilos - Gestor Tiny

Sistema de design e padrões de estilo para desenvolvimento consistente em todo o aplicativo.

## Princípios Fundamentais

1. **Componentes sobre classes**: Priorize componentes reutilizáveis sobre classes Tailwind inline
2. **Variáveis CSS para valores dinâmicos**: Use tokens de design para garantir consistência
3. **Dark mode first**: Todos os estilos devem suportar modo claro e escuro
4. **Performance**: Evite duplicação de estilos e valores hardcoded

---

## Hierarquia de Escolhas

Ao estilizar componentes, siga esta ordem de prioridade:

```
1. Componente UI existente
   ↓ (não existe componente adequado)
2. Classe utilitária CSS global
   ↓ (precisar de mais customização)
3. Classes Tailwind com variáveis CSS
   ↓ (último recurso)
4. Classes Tailwind diretas
```

### Exemplos Práticos

#### ✅ **Correto**: Usar componente
```tsx
import { Card } from '@/components/ui/Card';

<Card variant="glass" padding="lg">
  <h2>Título</h2>
</Card>
```

#### ⚠️ **Aceitável**: Usar classe utilitária
```tsx
<div className="glass-panel p-6">
  <h2>Título</h2>
</div>
```

#### ❌ **Evitar**: Recriar estilos inline
```tsx
<div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6">
  <h2>Título</h2>
</div>
```

---

## Design Tokens

Todos os tokens estão definidos em `app/design-tokens.css` e organizados por categoria.

### Cores

#### Marca
```css
var(--color-brand-primary)     /* #009CA6 */
var(--color-brand-light)       /* #00B5C3 */
var(--color-brand-dark)        /* #007982 */
```

#### Semânticas
```css
var(--color-success)           /* Verde - ações positivas */
var(--color-error)             /* Vermelho - erros e alertas */
var(--color-warning)           /* Âmbar - avisos */
var(--color-info)              /* Azul - informações */
```

#### Texto
```css
var(--text-primary)            /* Texto principal */
var(--text-secondary)          /* Texto secundário */
var(--text-tertiary)           /* Texto terciário/placeholder */
```

**Uso com Tailwind:**
```tsx
<h1 className="text-main">Título</h1>
<p className="text-muted">Descrição</p>
<span className="text-[var(--color-success)]">Sucesso</span>
```

### Espaçamento

Use classes do Tailwind quando possível, tokens para valores específicos:

```css
var(--spacing-card-md)         /* 1.5rem - padding padrão de cards */
var(--spacing-panel-md)        /* 2rem - padding padrão de painéis */
```

**Uso:**
```tsx
<Card padding="md">           {/* Usa --spacing-card-md */}
<div className="p-card">      {/* Tailwind custom class */}
```

### Border Radius

```css
var(--radius-card)             /* 2rem - cards */
var(--radius-input)            /* 1.5rem - inputs */
var(--radius-badge)            /* 0.5rem - badges */
var(--radius-chip)             /* 9999px - chips/pills */
```

**Uso:**
```tsx
<div className="rounded-card">
<input className="rounded-input">
```

### Sombras

```css
var(--shadow-card)             /* Sombra padrão de cards */
var(--shadow-elevated)         /* Cards elevados */
var(--shadow-floating)         /* Modais/popovers */
```

---

## Componentes UI

### Card

Componente base para containers e painéis.

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

// Variantes
<Card variant="default">      {/* Padrão - usa .app-card */}
<Card variant="glass">        {/* Translúcido */}
<Card variant="elevated">     {/* Com sombra elevada */}
<Card variant="bordered">     {/* Com borda sólida */}

// Padding
<Card padding="sm">           {/* 1rem */}
<Card padding="md">           {/* 1.5rem - padrão */}
<Card padding="lg">           {/* 2rem */}

// Com estrutura
<Card variant="glass" padding="lg">
  <CardHeader>
    <CardTitle>Título do Card</CardTitle>
    <CardDescription>Descrição opcional</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Conteúdo principal */}
  </CardContent>
  <CardFooter>
    {/* Ações/rodapé */}
  </CardFooter>
</Card>
```

### Badge

Para status, tipos e tags.

```tsx
import { Badge, DotBadge } from '@/components/ui/Badge';

// Variantes semânticas
<Badge variant="success">Ativo</Badge>
<Badge variant="error">Erro</Badge>
<Badge variant="warning">Aviso</Badge>
<Badge variant="info">Info</Badge>
<Badge variant="brand">Ambienta</Badge>

// Tamanhos
<Badge size="sm">Pequeno</Badge>
<Badge size="md">Médio</Badge>
<Badge size="lg">Grande</Badge>

// Com ícone
<Badge icon={<CheckIcon />}>Verificado</Badge>

// Outlined
<Badge variant="success" outline>Ativo</Badge>

// Dot Badge (contador)
<DotBadge count={5} variant="error" />
<DotBadge dotOnly variant="success" />
```

### Input

Input padronizado com suporte a validação e ícones.

```tsx
import { Input, SearchInput } from '@/components/ui/Input';

// Básico
<Input 
  label="Nome"
  placeholder="Digite seu nome"
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>

// Com erro
<Input 
  label="E-mail"
  type="email"
  error="E-mail inválido"
/>

// Variantes
<Input variant="default" />   {/* Padrão - .app-input */}
<Input variant="glass" />     {/* Translúcido */}
<Input variant="minimal" />   {/* Apenas borda inferior */}

// Com ícones
<Input leftIcon={<UserIcon />} />
<Input rightIcon={<LockIcon />} />

// Clearable
<Input 
  clearable
  onClear={() => setValue('')}
/>

// Input de busca
<SearchInput 
  placeholder="Buscar produtos..."
  onSearch={(value) => console.log(value)}
/>
```

### Chip

Para filtros, tags e seleção múltipla.

```tsx
import { Chip, ChipGroup, FilterChip } from '@/components/ui/Chip';

// Básico
<Chip onClick={() => console.log('clicked')}>
  Tag
</Chip>

// Ativo
<Chip active>Selecionado</Chip>

// Com remoção
<Chip onRemove={() => console.log('removed')}>
  Removível
</Chip>

// Com ícone
<Chip icon={<TagIcon />}>Categoria</Chip>

// Grupo de chips
<ChipGroup>
  <Chip active>Ativos</Chip>
  <Chip>Inativos</Chip>
  <Chip>Todos</Chip>
</ChipGroup>

// Filter Chip com contador
<FilterChip label="Pendentes" count={5} active />
```

---

## Classes Utilitárias Globais

Definidas em `app/globals.css`.

### Cards e Painéis

```css
.app-card          /* Card padrão do app */
.glass-panel       /* Painel translúcido com blur */
.glass-row         /* Linha com efeito glass */
.product-card      /* Card específico de produtos */
```

### Texto

```css
.text-main         /* var(--text-main) */
.text-muted        /* var(--text-muted) */
.text-soft         /* var(--text-soft) */
.text-accent       /* var(--accent) */
```

### Inputs

```css
.app-input         /* Input padrão com glass effect */
.app-input-editable /* Input editável inline */
```

### Chips e Filtros

```css
.app-chip-group    /* Grupo de chips com bordas arredondadas */
.app-chip          /* Chip individual */
.app-chip-active   /* Estado ativo do chip */
```

### Tabelas

```css
.app-table-header  /* Header sticky de tabelas */
.table-row-selected /* Linha selecionada em tabela */
```

---

## Dark Mode

### Princípios

1. **Todas as classes devem ter variante dark**
2. **Use variáveis CSS que mudam automaticamente** com `:root.dark`
3. **Teste sempre em ambos os modos** antes de commitar

### Padrões de Dark Mode

#### ✅ **Recomendado**: Variáveis CSS
```tsx
<div className="bg-[var(--surface-card-bg)] text-main">
  {/* Muda automaticamente com o tema */}
</div>
```

#### ✅ **Aceitável**: Classes dark: do Tailwind
```tsx
<div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
  {/* Tailwind aplica baseado na classe .dark */}
</div>
```

#### ❌ **Evitar**: Valores hardcoded sem variante dark
```tsx
<div className="bg-white text-black">
  {/* Não funciona em dark mode! */}
</div>
```

---

## Animações

Use as animações pré-definidas do Tailwind (via design tokens):

```tsx
<div className="animate-fade-in">Aparece suavemente</div>
<div className="animate-slide-in-up">Desliza de baixo</div>
<div className="animate-scale-in">Escala</div>
<div className="animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent">
  {/* Carregando */}
</div>
```

---

## Responsividade

Use breakpoints do Tailwind:

```tsx
<div className="
  grid 
  grid-cols-1        /* Mobile */
  md:grid-cols-2     /* Tablet */
  lg:grid-cols-3     /* Desktop */
  gap-4
">
```

**Breakpoints:**
- `sm`: 640px (mobile landscape)
- `md`: 768px (tablet)
- `lg`: 1024px (desktop)
- `xl`: 1280px (wide desktop)
- `2xl`: 1536px (ultra wide)

---

## Checklist de Código

Antes de commitar, verifique:

- [ ] Usei componentes UI quando possível?
- [ ] Evitei duplicar estilos que já existem?
- [ ] Usei variáveis CSS para cores e espaçamentos?
- [ ] Testei em dark mode?
- [ ] Classes estão organizadas e legíveis?
- [ ] Não há valores hardcoded desnecessários?

---

## Exemplos de Migração

### Antes (código antigo)
```tsx
<div className="rounded-2xl border border-white/10 dark:border-white/10 bg-white/5 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.35)] p-6">
  <h3 className="text-sm font-medium tracking-wide text-zinc-200 mb-2">
    Vendas Totais
  </h3>
  <p className="text-3xl font-bold text-white">
    R$ 125.430,00
  </p>
</div>
```

### Depois (código padronizado)
```tsx
import { Card, CardTitle } from '@/components/ui/Card';

<Card variant="glass" padding="lg">
  <CardTitle className="text-sm mb-2">
    Vendas Totais
  </CardTitle>
  <p className="text-3xl font-bold text-main">
    R$ 125.430,00
  </p>
</Card>
```

**Benefícios:**
- 60% menos código
- Manutenção centralizada
- Dark mode automático
- Consistência visual

---

## Recursos

- **Design Tokens**: `app/design-tokens.css`
- **Componentes UI**: `components/ui/`
- **Tailwind Config**: `tailwind.config.ts`
- **Estilos Globais**: `app/globals.css`

## Dúvidas?

Consulte o código dos componentes UI em `components/ui/` para ver exemplos de implementação e uso.
