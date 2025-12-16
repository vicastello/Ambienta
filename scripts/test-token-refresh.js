#!/usr/bin/env node

// Script para testar renovação manual do token
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Carregar .env.vercel
const envPath = path.join(process.cwd(), '.env.vercel');
const envContent = fs.readFileSync(envPath, 'utf-8');
const lines = envContent.split('\n');

for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
            const [, key, value] = match;
            const cleanValue = value.replace(/^["']|["']$/g, '');
            process.env[key.trim()] = cleanValue;
        }
    }
}

const TOKEN_URL = process.env.TINY_TOKEN_URL || 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token';
const CLIENT_ID = process.env.TINY_CLIENT_ID;
const CLIENT_SECRET = process.env.TINY_CLIENT_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function testTokenRefresh() {
    console.log('\n🔧 Teste de Renovação de Token do Tiny\n');
    console.log('='.repeat(60));

    // Verificar credenciais
    console.log('\n1️⃣ Verificando credenciais...\n');

    if (!CLIENT_ID) {
        console.log('❌ TINY_CLIENT_ID não configurado');
        return;
    }
    if (!CLIENT_SECRET) {
        console.log('❌ TINY_CLIENT_SECRET não configurado');
        return;
    }

    console.log(`✅ CLIENT_ID: ${CLIENT_ID.substring(0, 10)}...`);
    console.log(`✅ CLIENT_SECRET: ${CLIENT_SECRET ? CLIENT_SECRET.substring(0, 10) + '...' : 'não definido'}`);
    console.log(`✅ TOKEN_URL: ${TOKEN_URL}`);

    // Buscar refresh_token do banco
    console.log('\n2️⃣ Buscando refresh_token do banco...\n');

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
        auth: { persistSession: false }
    });

    const { data: tokenRow, error: tokenErr } = await supabase
        .from('tiny_tokens')
        .select('refresh_token, expires_at')
        .eq('id', 1)
        .maybeSingle();

    if (tokenErr || !tokenRow) {
        console.log('❌ Erro ao buscar token:', tokenErr?.message || 'Token não encontrado');
        return;
    }

    if (!tokenRow.refresh_token) {
        console.log('❌ Nenhum refresh_token encontrado no banco');
        console.log('💡 É necessário conectar o Tiny primeiro na interface');
        return;
    }

    console.log('✅ Refresh token encontrado');
    console.log(`   Expira em: ${new Date(tokenRow.expires_at).toISOString()}`);

    // Tentar renovar
    console.log('\n3️⃣ Tentando renovar token...\n');

    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('client_id', CLIENT_ID);
    body.set('client_secret', CLIENT_SECRET);
    body.set('refresh_token', tokenRow.refresh_token);

    try {
        const res = await fetch(TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json'
            },
            body
        });

        const text = await res.text();

        if (!res.ok) {
            console.log(`❌ Erro HTTP ${res.status}`);
            console.log('Resposta:\n');

            try {
                const errorJson = JSON.parse(text);
                console.log(JSON.stringify(errorJson, null, 2));

                if (errorJson.error === 'invalid_client') {
                    console.log('\n🔍 DIAGNÓSTICO:');
                    console.log('   O erro "invalid_client" geralmente indica:');
                    console.log('   1. CLIENT_ID ou CLIENT_SECRET incorretos');
                    console.log('   2. Aplicação OAuth foi reconfigurada no Tiny');
                    console.log('   3. Credenciais diferentes entre dev/produção');
                    console.log('\n💡 SOLUÇÃO:');
                    console.log('   1. Acesse o painel de desenvolvedor do Tiny');
                    console.log('   2. Verifique o CLIENT_ID e CLIENT_SECRET da sua aplicação');
                    console.log('   3. Atualize as variáveis de ambiente (.env.vercel e Vercel Dashboard)');
                    console.log('   4. Reconecte a aplicação se necessário');
                }
            } catch (e) {
                console.log(text);
            }
            return;
        }

        const json = JSON.parse(text);
        console.log('✅ Token renovado com sucesso!');
        console.log(`   Novo access_token: ${json.access_token?.substring(0, 20)}...`);
        console.log(`   Expira em: ${json.expires_in} segundos (${Math.floor(json.expires_in / 3600)} horas)`);

        // Salvar no banco
        console.log('\n4️⃣ Salvando no banco...\n');

        const nowMs = Date.now();
        const expiresAt = nowMs + ((json.expires_in ?? 0) - 60) * 1000;

        const { error: updateErr } = await supabase
            .from('tiny_tokens')
            .upsert({
                id: 1,
                access_token: json.access_token,
                refresh_token: json.refresh_token ?? tokenRow.refresh_token,
                expires_at: expiresAt,
                scope: json.scope,
                token_type: json.token_type
            }, { onConflict: 'id' });

        if (updateErr) {
            console.log('❌ Erro ao salvar:', updateErr.message);
        } else {
            console.log('✅ Token salvo no banco com sucesso!');
        }

    } catch (error) {
        console.log('❌ Erro ao fazer request:', error.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');
}

testTokenRefresh().catch(console.error);
