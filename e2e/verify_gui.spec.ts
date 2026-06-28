import { test, expect } from '@playwright/test';

test.describe('Package-Level ISO Standards Toggle End-to-End', () => {
  test('Verify toggle dynamically switches field picker terminology', async ({ page }) => {
    // 1. Navigate to localhost:5173
    console.log('Navigating to http://localhost:5173...');
    await page.goto('http://localhost:5173');
    
    // 2. Select the Payment Hub package dashboard (wait for it to load and click it)
    console.log('Clicking Payment Hub on Home Dashboard...');
    const paymentHubBtn = page.getByRole('button', { name: 'Payment Hub', exact: false }).first();
    await paymentHubBtn.waitFor({ state: 'visible', timeout: 8000 });
    await paymentHubBtn.click();
    
    // 3. Confirm that the Workspace Overview banner exists and shows disabled state by default
    console.log('Verifying initial toggle state...');
    await expect(page.locator('text=ISO 20022 Standards')).toBeVisible();
    await expect(page.locator('text=Disabled (Bank Custom)')).toBeVisible();

    // 4. Click the toggle switch to enable ISO standards
    console.log('Toggling ISO standards ON...');
    const toggleBtn = page.locator('span:text-is("ISO 20022 Standards")').locator('xpath=../..').locator('button').first();
    await toggleBtn.click();
    
    // Confirm status changes to Enabled
    await expect(page.locator('text=Enabled (ISO Names)')).toBeVisible();

    // 5. Navigate to the Rules Engine Studio
    console.log('Navigating to Rules Engine...');
    await page.hover('button:has-text("Designer Studio")');
    const rulesBtn = page.locator('button:has-text("5. Business Rules Engine")');
    if (!await rulesBtn.isVisible()) {
      console.log('Expanding Phase 2 accordion...');
      await page.click('button:has-text("Design Logic & Flow")');
    }
    await rulesBtn.click();
    await page.mouse.move(0, 0); // Reset mouse to close hover dropdown
    
    // Open New Rule Set modal
    await page.click('button:has-text("+ New Rule Set")');
    
    // Open the field picker
    console.log('Opening field picker in Rules Studio...');
    const fieldPicker = page.locator('div.cursor-pointer:has-text("Select ISO Field...")');
    await fieldPicker.first().click();

    // Verify it shows the ISO standard name (Settlement.CurrencyCode)
    console.log('Checking that picker shows ISO standard names...');
    await expect(page.locator('span:text-is("Settlement.CurrencyCode")')).toBeVisible();

    // Close picker/modal
    await page.keyboard.press('Escape');
    await page.locator('button:text-is("Cancel")').first().click();

    // 6. Navigate back and toggle ISO standards OFF
    console.log('Navigating back to Dashboard...');
    await page.click('button:has-text("360° Dashboard")');
    
    console.log('Toggling ISO standards OFF...');
    await toggleBtn.first().click();
    await expect(page.locator('text=Disabled (Bank Custom)')).toBeVisible();

    // 7. Go back to Rules Engine and verify it shows Bank Custom name (Currency Code)
    console.log('Re-navigating to Rules Engine...');
    await page.hover('button:has-text("Designer Studio")');
    if (!await rulesBtn.isVisible()) {
      console.log('Expanding Phase 2 accordion...');
      await page.click('button:has-text("Design Logic & Flow")');
    }
    await rulesBtn.click();
    await page.mouse.move(0, 0); // Reset mouse to close hover dropdown
    await page.click('button:has-text("+ New Rule Set")');
    await fieldPicker.first().click();

    console.log('Checking that picker shows custom bank names...');
    await expect(page.locator('span:text-is("Currency Code")')).toBeVisible();
    console.log('Verification Success!');
  });
});
