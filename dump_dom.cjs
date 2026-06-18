const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const designerButton = page.locator('button:has-text("Designer Studio")');
    await designerButton.click();
    await page.waitForTimeout(500);

    const processFlowOption = page.locator('button:has-text("5. Process Flow Designer")');
    await processFlowOption.click();
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
      const parentDiv = document.querySelector('.relative.overflow-hidden');
      if (parentDiv) {
        return {
          html: parentDiv.outerHTML.slice(0, 1000),
          clientHeight: parentDiv.clientHeight,
          clientWidth: parentDiv.clientWidth,
          styles: window.getComputedStyle(parentDiv).height
        };
      }
      const allDivs = Array.from(document.querySelectorAll('div')).map(d => d.className).filter(c => c.includes('h-'));
      return { error: 'Not found', classes: allDivs };
    });

    console.log('--- DOM ELEMENT INSPECTION ---');
    console.log(result);
  } catch (error) {
    console.error(error);
  } finally {
    await browser.close();
  }
})();
