const { chromium } = require('playwright');

(async () => {
  const url = process.argv[2] || 'http://localhost:3000/produtos?mockProduto=1';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // find the Vitrine button by title
    const btn = await page.$('button[title="Visualizar em vitrine (cards)"]');
    if (!btn) {
      console.error('Vitrine button not found');
      process.exit(2);
    }
    await btn.click();
    await page.waitForTimeout(400);

    // count ProdutoCard articles
    const cards = await page.$$eval('article[role="button"], .app-card', els => els.length);
    console.log('ProdutoCard count after click:', cards);
    if (cards > 0) {
      console.log('SUCCESS: Vitrine toggle works (cards visible)');
      process.exit(0);
    } else {
      console.error('FAIL: No cards visible after clicking Vitrine');
      process.exit(3);
    }
  } catch (err) {
    console.error('Error:', err);
    process.exit(4);
  } finally {
    await browser.close();
  }
})();
