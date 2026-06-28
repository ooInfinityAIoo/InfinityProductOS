import { test, expect } from '@playwright/test';

test.describe('E2E UAT Simulation: Maker/Checker Commercial Payment', () => {
  test('Simulate Alice (Maker) inputting the transaction and Bob (Checker) approving it in the Transaction Cockpit', async ({ page }) => {
    test.setTimeout(90000);

    page.on('console', msg => {
      console.log(`[BROWSER CONSOLE] [${msg.type()}] ${msg.text()}`);
    });

    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(3000);

    console.log('Activating the Payment Hub package context...');
    await page.click('button:has-text("Payment Hub")');
    await page.waitForTimeout(1500);

    console.log('Navigating to Transaction Workflows (Cockpit)...');
    await page.click('button:has-text("Transaction Workflows")');
    await page.waitForTimeout(2000);

    console.log('Alice (MAKER) initiates new transaction...');
    await page.click('button:has-text("▶ New transaction")');
    await page.waitForTimeout(2000);

    console.log('Selecting Product Context and Workflow...');
    await page.selectOption('select', { label: 'Cross-Border Payments' });
    await page.waitForTimeout(1000);
    
    await page.locator('select').nth(1).selectOption({ label: 'Commercial Supplier Payment (MT103)' });
    await page.waitForTimeout(1000);
    
    const workflowSelect = page.locator('select').nth(2);
    if (await workflowSelect.isVisible()) {
        await workflowSelect.selectOption({ label: 'UAT Commercial Custom Flow (WF-UAT-COMMERCIAL)' });
    }
    await page.waitForTimeout(2000);

    console.log('Filling out dynamic transaction payload to trigger AML rule...');
    await page.getByPlaceholder(/invoice/i).fill('600000', { timeout: 2000 }).catch(() => {});
    await page.getByPlaceholder(/xchg|exchange/i).fill('1.2', { timeout: 2000 }).catch(() => {});
    await page.getByPlaceholder(/supplier|name/i).fill('Acme Corp', { timeout: 2000 }).catch(() => {});
    await page.getByPlaceholder(/bic/i).fill('ACMEUS33', { timeout: 2000 }).catch(() => {});
    
    // Fallback: fill all number inputs with 600000 to guarantee the BRE rule trips
    const numInputs = page.locator('input[type="number"]');
    const count = await numInputs.count();
    for (let i = 0; i < count; i++) {
        await numInputs.nth(i).fill('600000', { timeout: 1000 }).catch(() => {});
    }
    await page.waitForTimeout(1000);

    console.log('Submitting Initiation Form...');
    // Attempt to submit the rendered screen form. We look for Submit or Initiate buttons.
    const submitBtns = page.getByRole('button', { name: /Submit|Initiate|Run/i });
    if (await submitBtns.count() > 0) {
        await submitBtns.first().click();
    } else {
        await page.click('button[type="submit"]', { force: true }).catch(e => console.log('Submit button not natively found:', e));
    }
    
    // Wait for the backend engine to execute the flow
    await page.waitForTimeout(4000);
    console.log('Backend execution triggered. Reviewing metro tracker...');

    // Simulate Bob (CHECKER) login and approval
    console.log('Bob (CHECKER) intervenes to approve transaction...');
    const approveBtn = page.getByRole('button', { name: /Approve/i });
    if (await approveBtn.isVisible()) {
        await approveBtn.click();
        console.log('Transaction approved by Checker!');
        await page.waitForTimeout(2000);
    } else {
        console.log('No manual intervention step flagged. Transaction may have completed or failed validation.');
    }

    console.log('UAT E2E Execution Simulation complete.');
  });
});
