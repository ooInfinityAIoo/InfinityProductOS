import { test, expect } from '@playwright/test';

test('register custom UAT fields in the data dictionary', async ({ page }) => {
  test.setTimeout(120000); // 2 minutes

  console.log('Navigating to local console...');
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(2000);

  console.log('Selecting Payment Hub package...');
  // Click on the Payment Hub package card to enter the context
  await page.click('text="Payment Hub"', { force: true });
  await page.waitForTimeout(2000);

  console.log('Navigating to Data Dictionary (Field Registry)...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const target = buttons.find(b => b.textContent && b.textContent.includes('Data Dictionary'));
    if (target) {
      target.click();
    } else {
      throw new Error('Data Dictionary button not found');
    }
  });
  await page.waitForTimeout(2000);

  const fieldsToCreate = [
    { tech: 'tx_supplier_name', iso: 'Supplier.Name', client: 'UAT Supplier Name', type: 'Text' },
    { tech: 'tx_bic_code', iso: 'Supplier.BICCode', client: 'UAT BIC Code', type: 'Alphanumeric' },
    { tech: 'tx_raw_amount', iso: 'Procurement.InvoiceAmount', client: 'UAT Invoiced Amount', type: 'Amount' },
    { tech: 'tx_converted_value', iso: 'Procurement.ConvertedValue', client: 'UAT Converted Value', type: 'Amount' },
    { tech: 'tx_exchange_rate', iso: 'Procurement.XchgRate', client: 'UAT Exchange Rate', type: 'Decimal' },
    { tech: 'tx_reconciliation_status', iso: 'Settlement.ReconciliationStatus', client: 'UAT Reconciliation Status', type: 'Text' }
  ];

  for (const field of fieldsToCreate) {
    console.log(`\nRegistering field via GUI: ${field.tech}...`);
    
    // Open Drawer
    await page.click('text="+ New Field"');
    await page.waitForSelector('text="Register New ISO Field"', { state: 'visible' });

    // Fill inputs
    await page.fill('input[name="technical_sys_name"]', field.tech);
    await page.fill('input[name="iso_business_name"]', field.iso);
    await page.fill('input[name="client_business_name"]', field.client);
    await page.selectOption('select[name="data_type"]', field.type);

    // Save preferences radio - select CLIENT to display customized names
    await page.click('input[name="display_preference"][value="CLIENT"]');

    // Submit
    await page.click('button[type="submit"]:has-text("Register Field")');
    
    // Wait for drawer to close
    await page.waitForSelector('text="Register New ISO Field"', { state: 'hidden' });
    console.log(`Field ${field.tech} registered successfully.`);
    await page.waitForTimeout(500);
  }

  console.log('\nAll fields registered successfully via GUI.');
});
