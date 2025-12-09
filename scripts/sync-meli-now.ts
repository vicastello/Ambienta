/**
 * Script para sincronizar pedidos do Mercado Livre manualmente
 */

async function syncMeliNow() {
  console.log("🔄 Iniciando sincronização manual dos pedidos do Mercado Livre...\n");

  try {
    const response = await fetch('http://localhost:3000/api/marketplaces/mercado-livre/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        periodDays: 7,
        pageLimit: 5,
        pageSize: 50,
      }),
    });

    const text = await response.text();

    if (!response.ok) {
      console.error(`❌ Erro HTTP ${response.status}: ${response.statusText}`);
      console.error("Resposta:", text);
      return;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      console.error("❌ Resposta não é JSON válido:", text);
      return;
    }

    if (data.ok) {
      console.log("✅ Sincronização concluída com sucesso!\n");
      console.log("📊 Resultado:");
      console.log(`   Pedidos sincronizados: ${data.data.ordersUpserted}`);
      console.log(`   Itens sincronizados: ${data.data.itemsUpserted}`);
      console.log(`   Páginas processadas: ${data.data.pagesFetched}`);
    } else {
      console.error("❌ Erro na sincronização:", data.error);
    }

  } catch (error: any) {
    console.error("❌ Erro ao sincronizar:", error.message);
  }
}

syncMeliNow().catch(console.error);
