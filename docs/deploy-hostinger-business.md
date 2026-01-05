# Deploy na Hostinger Business (Node.js)

Este guia documenta o processo de deploy da aplicação Gestor Tiny (Next.js) para a hospedagem **Hostinger Business Web Hosting** rodando como aplicação Node.js standalone.

## 1. Pré-requisitos

- **Plano**: Hostinger Business Web Hosting ou VPS.
- **Node.js**: Versão 20 (LTS) ou superior configurada no painel.
- **Acesso**: SSH ou Terminal Web ativo.

## 2. Preparando a Aplicação (Local)

O projeto foi configurado para **Standalone Mode**, o que cria um pacote Node.js otimizado e menor para produção.

### Build Local (para teste)

```bash
npm run build
```

Isso deve gerar o diretório `.next/standalone`.

## 3. Configuração no Painel Hostinger

No hPanel -> Sites -> Gerenciar -> **Aplicativo Node.js**:

1.  **Versão Node.js**: Selecione **20** ou superior.
2.  **Modo de Aplicação**: **Production**.
3.  **Application Root**: Deixe como está (geralmente `domains/seudominio.com/public_html` ou similar).
4.  **Application Startup File**: `.next/standalone/server.js`
    *   *Nota*: Se o painel não aceitar caminhos profundos, você pode precisar criar um `server.js` na raiz que aponta para lá: `require('./.next/standalone/server.js')`.
5.  **Instalar Dependências**: O botão "NPM Install" do painel pode não instalardevDependencies necessárias para build se `NODE_ENV=production`. Recomenda-se rodar via terminal.

### Variáveis de Ambiente

Configure as variáveis no painel (Environment Variables) conforme `env.example` (ou `.env.example`).
**Crítico**:
- `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto Supabase.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Chave pública.
- `SUPABASE_SERVICE_ROLE_KEY`: Chave secreta (Server-side).
- `CRON_SECRET`: Chave secreta para proteger endpoints de cron.

## 4. Processo de Deploy (Automático via Git ou Manual)

### Via Git (Recomendado)

1.  Configure o repositório Git no painel da Hostinger.
2.  Adicione o script de "Build Command" (se disponível) ou use Configuração de Deploy para rodar:
    ```bash
    npm install
    npm run build
    # Copiar estáticos (Passo CRÍTICO para standalone)
    cp -r .next/static .next/standalone/.next/static
    cp -r public .next/standalone/public
    ```
3.  Reinicie a aplicação.

### Via Terminal (SSH)

Se preferir controle total, acesse via SSH e rode:

```bash
# 1. Pull das últimas mudanças
git pull origin main

# 2. Instalar dependências
npm install

# 3. Build
npm run build

# 4. Preparar Standalone (Cópia de arquivos estáticos é OBRIGATÓRIA)
# O Next.js não copia assets estáticos para a pasta standalone automaticamente.
# Você precisa fazer isso manualmente ou via script de postbuild.
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

# 5. Reiniciar serviço (depende da Hostinger, geralmente via painel ou kill node)
# No painel: Botão "Restart"
```

## 5. Cron Jobs

Como removemos o `vercel.json`, os Cron Jobs devem ser configurados externamente.

### Opção A: Supabase pg_cron (Recomendado)

Use o banco de dados para agendar tarefas. O job `run-sync` já roda lá.

### Opção B: Hostinger Cron Jobs

No painel **Cron Jobs** da Hostinger, configure chamadas `curl` para os endpoints da API protegidos.

**Exemplo: Atualizar Token Tiny (Diário)**
- **Comando**:
  ```bash
  curl -X GET -H "Authorization: Bearer SEU_CRON_SECRET" https://seudominio.com/api/admin/cron/refresh-tiny-token
  ```
- **Frequência**: A cada 6 horas (ou diário).

## 6. Checklist de Verificação

Após o deploy:

- [ ] Acessar `https://seudominio.com/api/health` -> deve retornar `{"ok":true, ...}`.
- [ ] Login na aplicação funciona.
- [ ] Dashboard carrega dados do Supabase.
- [ ] Verificar logs no painel Hostinger se houver erro 500.

## 7. Troubleshooting

**Erro: Find module 'server.js' not found**
- Verifique se o "Application Startup File" aponta corretamente para `.next/standalone/server.js`.
- Verifique se rodou `npm run build` com sucesso.

**Erro: Estilos (CSS) ou Imagens quebradas**
- Você esqueceu de copiar as pastas `static` e `public`. Rode os comandos `cp` listados acima.

**Erro: 500 Internal Server Error**
- Verifique as variáveis de ambiente no painel.
- Verifique os logs da aplicação.
