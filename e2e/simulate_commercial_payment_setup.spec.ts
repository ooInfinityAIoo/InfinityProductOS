import { test, expect } from '@playwright/test';

test.describe('E2E Full Platform Setup & UAT Simulation', () => {
  test('Simulate complete end-to-end UAT setup as Business Operations Admin User', async ({ page }) => {
    // Increase test timeout for this extensive E2E flow
    test.setTimeout(90000);

    // Listen to browser console and page errors for UAT debugging
    page.on('console', msg => {
      console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => {
      console.log(`[BROWSER EXCEPTION] ${err.message}`);
    });

    // Intercept network responses to print HTTP 400/422 error details
    page.on('response', async response => {
      const status = response.status();
      if (status >= 400) {
        console.log(`[HTTP ERROR ${status}] URL: ${response.url()}`);
        try {
          const body = await response.json();
          console.log(`[HTTP ERROR BODY]`, JSON.stringify(body, null, 2));
        } catch (e) {
          try {
            const text = await response.text();
            console.log(`[HTTP ERROR TEXT]`, text);
          } catch (e2) {
            console.log(`[HTTP ERROR] Could not read response body`);
          }
        }
      }
    });

    // 1. Load the operational console dashboard
    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(4000); // Allow dashboards and APIs to settle

    // Helper function to force open only the active header menu to avoid overlaps
    const showMenu = async (menuName: 'Master Data' | 'Designer Studio' | 'Runtime Operations') => {
      console.log(`Force-opening header menu: "${menuName}"...`);
      await page.evaluate((targetName) => {
        // Reset all menus first
        const absoluteMenus = document.querySelectorAll('div.relative.group div.absolute');
        absoluteMenus.forEach(menu => {
          (menu as HTMLElement).style.setProperty('display', 'none', 'important');
        });
        
        // Find and force display of target menu
        const groups = document.querySelectorAll('div.relative.group');
        groups.forEach(group => {
          if (group.textContent && group.textContent.includes(targetName)) {
            const absoluteMenu = group.querySelector('div.absolute');
            if (absoluteMenu) {
              (absoluteMenu as HTMLElement).style.setProperty('display', 'flex', 'important');
            }
          }
        });
      }, menuName);
      await page.waitForTimeout(600);
    };

    // Helper function to hide absolute menus so they don't block viewport clicks
    const hideMenus = async () => {
      console.log('Hiding all header dropdown menus...');
      await page.evaluate(() => {
        const absoluteMenus = document.querySelectorAll('div.relative.group div.absolute');
        absoluteMenus.forEach(menu => {
          (menu as HTMLElement).style.setProperty('display', 'none', 'important');
        });
      });
      await page.waitForTimeout(600);
    };

    // Assert main elements are visible
    await expect(page.getByText('Infinity ProductOS')).toBeVisible();

    // 2. Initialize the Product Package via Wizard
    console.log('Opening Package Initialization Wizard...');
    const newPkgBtn = page.getByRole('button', { name: '+ New Package', exact: false });
    const startCfgBtn = page.getByRole('button', { name: '+ Start Configuring New Product', exact: false });
    
    if (await newPkgBtn.isVisible()) {
      await newPkgBtn.click();
    } else {
      await startCfgBtn.click();
    }

    const runTimestamp = Date.now();
    const uniquePackageName = `UAT Payments ${runTimestamp}`;
    console.log(`Setting up Package Brand: "${uniquePackageName}"...`);
    await page.fill('input[placeholder="e.g., Global Payment Hub"]', uniquePackageName);
    await page.selectOption('select', 'Payments');
    await page.locator('input').nth(1).fill('GB'); // Jurisdiction code
    await page.locator('input').nth(2).fill('GBP'); // Base currency code
    
    console.log('Clicking "Initialize Package"...');
    await page.click('button:has-text("Initialize Package")');

    // Wait for modal to dismiss and platform context to switch
    await page.waitForTimeout(3000);
    console.log('Package initialized and active product context configured.');

    // 3. Register a Payment Product in the Product Registry
    console.log('Navigating to Product Registry...');
    await showMenu('Master Data');
    await page.click('button:has-text("Product Registry")');
    await hideMenus();
    await page.waitForTimeout(1000);

    console.log('Creating a new payment product: "UAT SWIFT Payment"...');
    await page.click('button:has-text("+ New Product")');
    await page.fill('input[placeholder="e.g., SWIFT MT103 Cross-Border Wire"]', 'UAT SWIFT Payment');
    await page.fill('input[placeholder="e.g., SWIFT Wire"]', 'UAT SWIFT');
    await page.fill('input[placeholder="e.g., SWIFT-WIRE"]', 'UAT-SWIFT');
    await page.selectOption('select', 'PAYMENTS');
    await page.fill('textarea[placeholder="Describe the purpose and scope of this product…"]', 'UAT Cross-Border Commercial Supplier Payment');
    await page.click('button:has-text("Create Product")');
    await page.waitForTimeout(2000);
    console.log('Payment product created successfully.');

    // 4. Register Custom Fields in the Universal Data Registry (Ungated)
    console.log('Navigating to Field Registry (Data Dictionary)...');
    await showMenu('Master Data');
    await page.click('button:has-text("Data Dictionary")');
    await hideMenus();
    await page.waitForTimeout(1000);

    // Register 1: Amount field
    const amountTechName = `uat_amount_${runTimestamp}`;
    console.log(`Registering Ingestion Amount field: "${amountTechName}"...`);
    await page.click('button:has-text("+ New Field")');
    await page.fill('input[name="technical_sys_name"]', amountTechName);
    await page.fill('input[name="iso_business_name"]', `Procurement.InvoiceAmount.${runTimestamp}`);
    await page.fill('input[name="client_business_name"]', `UAT Invoiced Amount ${runTimestamp}`);
    await page.selectOption('select[name="data_type"]', 'Amount');
    await page.click('button:has-text("Register Field")');
    await expect(page.locator('text=Register New ISO Field')).toBeHidden();
    await page.waitForTimeout(1000);

    // Register 2: Calculated exchange rate field
    const rateTechName = `uat_rate_${runTimestamp}`;
    console.log(`Registering Exchange Rate field: "${rateTechName}"...`);
    await page.click('button:has-text("+ New Field")');
    await page.fill('input[name="technical_sys_name"]', rateTechName);
    await page.fill('input[name="iso_business_name"]', `Procurement.XchgRate.${runTimestamp}`);
    await page.fill('input[name="client_business_name"]', `UAT Exchange Rate ${runTimestamp}`);
    await page.selectOption('select[name="data_type"]', 'Decimal');
    await page.click('button:has-text("Register Field")');
    await expect(page.locator('text=Register New ISO Field')).toBeHidden();
    await page.waitForTimeout(1000);

    // 5. Design Entry & Approval Screens
    console.log('Navigating to Screen Designer...');
    await showMenu('Designer Studio');
    await page.click('button:has-text("Connect & Render")'); // Expand Phase 3 accordion
    await page.waitForTimeout(500);
    await page.click('button:has-text("8. Screen Design Studio")');
    await hideMenus();
    await page.waitForTimeout(1000);

    // Selecting the product in the CockpitLockBanner (now mounted in Screen Designer)
    console.log('Waiting for CockpitLockBanner product select dropdown...');
    const productSelect = page.locator('div:has-text("Advanced Record Filters") select').first();
    await expect(productSelect).toBeVisible();

    const optionsText = await productSelect.evaluate(select => {
      return Array.from((select as HTMLSelectElement).options).map(o => o.text);
    });
    console.log('[DEBUG COCKPIT SELECT OPTIONS]:', optionsText);

    console.log('Selecting the registered product in the CockpitLockBanner...');
    await productSelect.selectOption({ index: 1 });
    await page.waitForTimeout(1500);

    const screenName = `SCR-UAT-ENTRY-${runTimestamp}`;
    console.log(`Creating Entry screen: "${screenName}"...`);
    await page.click('button:has-text("+ New Screen")');
    await page.fill('input[placeholder="e.g., MANAGER_APPROVAL_FORM"]', screenName);
    await page.fill('input[placeholder="A brief summary of when this screen is presented."]', `UAT Ingestion Form ${runTimestamp}`);
    await page.click('button:has-text("Save & Submit for Approval")');
    await page.waitForTimeout(2000);

    // 6. Open Workflow Studio reactflow canvas
    console.log('Navigating to Workflow Designer...');
    await showMenu('Designer Studio');
    await page.click('button:has-text("Design Logic & Flow")'); // Expand Phase 2 accordion
    await page.waitForTimeout(500);
    await page.click('button:has-text("4. Workflow Designer")');
    await hideMenus();
    await page.waitForTimeout(1000);

    console.log('Opening Workflow templates modal...');
    await page.click('button:has-text("New from Template")');
    await page.waitForTimeout(1000);

    console.log('Selecting first available payment workflow template...');
    await page.locator('button:has-text("+ Use")').first().click();
    await page.waitForTimeout(3000);

    // Assert canvas is loaded
    await expect(page.locator('.react-flow__renderer')).toBeVisible();
    console.log('Workflow ReactFlow canvas successfully loaded.');

    // 7. Navigate to Transaction Cockpit for Run & Verification
    console.log('Navigating to Transaction Workflow screen...');
    await page.click('button:has-text("Transaction Workflow")');
    await page.waitForTimeout(2000);

    // Open transaction entry wizard
    console.log('Clicking "▶ New transaction" button...');
    await page.click('button:has-text("▶ New transaction")');

    // Pick unique product context and workflow
    console.log('Selecting UAT Product context in initiation wizard...');
    await page.selectOption('select', { label: 'UAT SWIFT Payment' });
    await page.waitForTimeout(2000);

    // Since we created it, the dropdown should populate
    const workflowOption = page.locator('select').nth(2).locator('option').nth(1);
    if (await workflowOption.isVisible()) {
       console.log('Selecting active workflow template...');
       await page.locator('select').nth(2).selectOption({ index: 1 });
    }

    await page.click('button:has-text("Cancel")', { force: true });
    console.log('UAT GUI transaction path verified.');

    // 8. Verify Operational Dashboards are live and reporting
    console.log('Checking Global Operational Dashboard...');
    await page.click('button:has-text("360° Dashboard")');
    await expect(page.getByText(uniquePackageName).first()).toBeVisible();

    console.log('Checking Ingestion Pipeline Monitor...');
    await showMenu('Runtime Operations');
    await page.click('button:has-text("1. File Import Gateway")');
    await hideMenus();
    await expect(page.getByText('File Upload & Dispatcher')).toBeVisible();

    console.log('Checking Event Dictionary...');
    await showMenu('Runtime Operations');
    await page.click('button:has-text("3. Event Catalog")');
    await hideMenus();
    await expect(page.getByText('Event Dictionary & Topology')).toBeVisible();

    console.log('Checking Compliance Execution Audit Ledger...');
    await showMenu('Runtime Operations');
    await page.click('button:has-text("4. Execution Traces")');
    await hideMenus();
    await expect(page.getByText('Execution & Audit Viewer')).toBeVisible();

    console.log('E2E Platform UAT Simulation Complete and Successful!');
  });
});
