const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    await page.setViewportSize({ width: 1920, height: 1200 });
    console.log('Navigating to local console...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    console.log('Navigating to Process Flow Studio...');
    const designerButton = page.locator('button:has-text("Designer Studio")');
    await designerButton.click();
    await page.waitForTimeout(500);

    const processFlowOption = page.locator('button:has-text("5. Process Flow Designer")');
    await processFlowOption.click();
    await page.waitForTimeout(1000);

    // Close the dropdown by clicking neutral area
    await page.click('text=Textual Sequence Blueprint');
    await page.waitForTimeout(500);

    console.log('Selecting Product and Subproduct Context...');
    await page.selectOption('select', { label: 'FEDWIRE' });
    await page.waitForTimeout(500);

    console.log('Clicking on first sequence step to select it...');
    const modifyButton = page.locator('tr:has-text("Place Transaction on Hold") button:has-text("Modify")');
    await modifyButton.click();
    await page.waitForTimeout(1000);

    console.log('Taking full page screenshot...');
    const screenshotPath = '/Users/nisargshah/.gemini/antigravity-ide/brain/9cd08689-e585-48d2-9cab-af71ac48d293/verify_workflow_canvas_rework.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to ${screenshotPath}`);

  } catch (error) {
    console.error('Error during screenshot execution:', error);
  } finally {
    await browser.close();
  }
})();
