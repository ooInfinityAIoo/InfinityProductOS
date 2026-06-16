import { test, expect } from '@playwright/test';

test.describe('Infinity ProductOS - Core User Journeys', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept and mock initial API calls to ensure stable, isolated testing 
    // without requiring the live Python backend to be running in the CI environment.
    await page.route('**/api/v1/masters/theme', route => route.fulfill({ json: { brand_name: 'Infinity Demo Bank' } }));
    await page.route('**/api/v1/fields/registry?limit=1', route => route.fulfill({ json: { total_count: 142 } }));
    await page.route('**/api/v1/rules/', route => route.fulfill({ json: [] }));
    await page.route('**/api/v1/governance/tasks/pending', route => route.fulfill({ json: { pending_tasks: [] } }));
    await page.route('**/api/v1/masters/packages', route => route.fulfill({ json: { packages: [] } }));

    // Assume Vite/React runs on port 3000 locally
    await page.goto('http://localhost:3000');
  });

  test('Journey 1: Navigate seamlessly across different Canvas Studios', async ({ page }) => {
    // 1. Verify Home Dashboard loads
    await expect(page.getByText('Welcome to Infinity ProductOS')).toBeVisible();
    await expect(page.getByText('Infinity Demo Bank')).toBeVisible();

    // 2. Navigate to Rules Engine
    await page.click('button:has-text("Rules Engine")');
    await expect(page.getByText('Rules Library')).toBeVisible();
    await expect(page.getByText('Configured logic manifests.')).toBeVisible();

    // 3. Navigate to API Designer
    await page.click('button:has-text("API Designer")');
    await expect(page.getByText('Integration Hub')).toBeVisible();
    
    // 4. Navigate to Event Repository
    await page.click('button:has-text("Event Repository")');
    await expect(page.getByText('Event Dictionary & Topology')).toBeVisible();
  });

  test('Journey 2: Initialize a new Product Application Package', async ({ page }) => {
    // 1. Open the Product Initialization Wizard
    await page.click('button:has-text("+ Start Configuring New Product")');
    await expect(page.getByText('Initialize New Product Application Package')).toBeVisible();

    // 2. Fill out Product Details
    await page.fill('input[placeholder="e.g., Global Treasury Hub"]', 'NextGen Payments Hub');
    await page.selectOption('select', { label: 'Payments & Clearing' });
    
    // 3. Intercept the POST request to simulate a successful backend creation
    await page.route('**/api/v1/masters/packages', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 201, json: { package_id: 'PKG-123', package_name: 'NextGen Payments Hub' } });
      } else {
        await route.continue();
      }
    });

    // 4. Submit the configuration
    await page.click('button:has-text("Initialize Product Configuration")');
    
    // Verify the wizard closes automatically upon success
    await expect(page.getByText('Initialize New Product Application Package')).toBeHidden();
  });

  test('Journey 3: Design and draft a new Business Rule Set', async ({ page }) => {
    // Mock the field registry so the dropdown has options
    await page.route('**/api/v1/fields/registry?limit=1000', route => route.fulfill({
      json: { fields: [{ technical_sys_name: 'tx_amount', preferred_business_name: 'Transaction Amount' }] }
    }));

    // Navigate to Rules Engine and start creating
    await page.click('button:has-text("Rules Engine")');
    await page.click('button:has-text("+ New Rule Set")');
    await expect(page.getByText('Design New Business Rule Set')).toBeVisible();

    // Fill out the metadata
    await page.fill('input[placeholder="e.g., VIP Account Threshold"]', 'High Value Tx Rule');
    await page.fill('input[placeholder="e.g., BRE-VIP-001"]', 'BRE-TX-100');

    // Wait for dropdown to populate, then select conditions
    await page.locator('select').first().selectOption('tx_amount');
    await page.locator('select').nth(1).selectOption('GREATER_THAN');
    await page.fill('input[placeholder="Static Value"]', '100000');

    // Verify the visual builder renders correctly
    await expect(page.getByText('THEN Action')).toBeVisible();
  });
});