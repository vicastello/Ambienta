const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const url = process.argv[2] || 'http://localhost:3000/produtos?mockProduto=1';
  const viewportRaw = process.argv[3] || process.env.VIEWPORT || '';
  const viewportMatch = String(viewportRaw).trim().match(/^(\d{2,5})x(\d{2,5})$/i);
  const viewport = viewportMatch
    ? { width: Number(viewportMatch[1]), height: Number(viewportMatch[2]) }
    : { width: 1366, height: 768 };
  const outPath = path.resolve(process.cwd(), 'tmp', 'overflow_report.md');
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    if (!resp || !resp.ok()) {
      console.warn('Warning: page response not ok', resp && resp.status());
    }

    await page.waitForTimeout(1000);

    const results = await page.evaluate(() => {
      function getXPath(el) {
        if (!el) return null;
        const xpath = [];
        while (el && el.nodeType === Node.ELEMENT_NODE && el.tagName.toLowerCase() !== 'html') {
          let sibCount = 0;
          let sibIndex = 0;
          const tagName = el.tagName.toLowerCase();
          for (let sib = el.previousSibling; sib; sib = sib.previousSibling) {
            if (sib.nodeType === Node.ELEMENT_NODE && sib.tagName === el.tagName) sibCount++;
          }
          for (let sib = el.nextSibling; sib; sib = sib.nextSibling) {
            if (sib.nodeType === Node.ELEMENT_NODE && sib.tagName === el.tagName) sibIndex++;
          }
          const index = sibCount ? `[$ {sibCount + 1}]` : '';
          xpath.unshift(`${tagName}${index}`);
          el = el.parentNode;
        }
        return '/' + xpath.join('/');
      }

      const viewport = { width: window.innerWidth, height: window.innerHeight }; // layout viewport
      const overflowing = [];

      // Try elements that are visible
      const all = Array.from(document.querySelectorAll('body *'));
      for (const el of all) {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) continue;
        const rect = el.getBoundingClientRect();
        // Ignore zero-sized
        if (rect.width === 0 && rect.height === 0) continue;
        // Ignore elements fully inside
        const outLeft = rect.left < 0;
        const outRight = rect.right > viewport.width;
        const outTop = rect.top < 0;
        const outBottom = rect.bottom > viewport.height;
        if (outLeft || outRight || outTop || outBottom) {
          overflowing.push({
            tag: el.tagName.toLowerCase(),
            class: (typeof el.className === 'string' ? el.className : (el.getAttribute && el.getAttribute('class')) || null),
            id: el.id || null,
            rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
            computed: {
              marginLeft: style.marginLeft,
              marginRight: style.marginRight,
              paddingLeft: style.paddingLeft,
              paddingRight: style.paddingRight,
              whiteSpace: style.whiteSpace,
              display: style.display,
              position: style.position,
              transform: style.transform,
            },
            html: el.outerHTML ? el.outerHTML.slice(0, 2000) : null,
            xpath: null,
          });
        }
      }

      // Add XPath approximations
      // (simple approach: build path by tag.class)
      for (const item of overflowing) {
        try {
          const el = document.querySelector(item.id ? `#${item.id}` : item.class ? `${item.tag}.${item.class.split(' ').join('.')}` : item.tag);
          if (el) {
            let path = '';
            let cur = el;
            while (cur && cur.nodeType === Node.ELEMENT_NODE && cur.tagName.toLowerCase() !== 'html') {
              const tag = cur.tagName.toLowerCase();
              let seg = tag;
              if (cur.id) seg += `#${cur.id}`;
              else if (cur.className) seg += `.${cur.className.split(' ').join('.')}`;
              path = '/' + seg + path;
              cur = cur.parentNode;
            }
            item.xpath = path;
          }
        } catch (e) {
          // ignore
        }
      }

      return { viewport, count: overflowing.length, items: overflowing.slice(0, 200) };
    });

    const md = [];
    md.push(`# Overflow report for ${url}\n`);
    const vs = page.viewportSize ? page.viewportSize() : { width: 1366, height: 768 };
    md.push(`Viewport: ${vs.width}x${vs.height}\n`);
    md.push(`Detected ${results.count} overflowing elements.\n`);
    results.items.forEach((it, idx) => {
      md.push(`## ${idx + 1}. <${it.tag}> ${it.id ? `#${it.id}` : ''} ${it.class ? `.${it.class.split(' ').join('.')}` : ''}\n`);
      md.push(`- rect: left=${it.rect.left}, right=${it.rect.right}, top=${it.rect.top}, bottom=${it.rect.bottom}, width=${it.rect.width}, height=${it.rect.height}\n`);
      md.push(`- computed: position=${it.computed.position}, display=${it.computed.display}, whiteSpace=${it.computed.whiteSpace}, transform=${it.computed.transform}\n`);
       if (it.xpath) md.push('- path: `' + it.xpath + '`\n');
      md.push('\n');
      if (it.html) md.push('```html\n' + it.html + '\n```\n');
    });

    await fs.promises.writeFile(outPath, md.join('\n'), 'utf8');
    console.log('Report written to', outPath);
  } catch (err) {
    console.error('Error during detection:', err);
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
})();
