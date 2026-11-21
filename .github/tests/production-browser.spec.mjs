import { test, expect } from '@playwright/test';

test('protected deep link presents accessible login when unauthenticated', async ({page}) => {
  await page.goto('/projects/1/manage', {waitUntil:'domcontentloaded'});
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading',{name:'ULO/UAT Manager'})).toBeVisible();
  await expect(page.getByLabel('Email',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Password',{exact:true})).toBeVisible();
});

test('password visibility control is accessible without submitting credentials', async ({page}) => {
  await page.goto('/login', {waitUntil:'domcontentloaded'});
  const input=page.getByLabel('Password',{exact:true});
  await expect(input).toHaveAttribute('type','password');
  await page.getByRole('button',{name:'Tampilkan password'}).click();
  await expect(input).toHaveAttribute('type','text');
  await page.getByRole('button',{name:'Sembunyikan password'}).click();
  await expect(input).toHaveAttribute('type','password');
  await page.getByLabel('Email',{exact:true}).fill('invalid-format');
  const valid=await page.getByLabel('Email',{exact:true}).evaluate(input=>input.checkValidity());
  expect(valid).toBe(false);
});

test('login screen fits narrow mobile viewport without horizontal scroll', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await page.goto('/login', {waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'ULO/UAT Manager'})).toBeVisible();
  const dims=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:window.innerWidth}));
  expect(dims.scroll).toBeLessThanOrEqual(dims.viewport+1);
});


test('login controls can be operated by keyboard alone', async ({page}) => {
  await page.goto('/login', {waitUntil:'domcontentloaded'});
  const password=page.getByLabel('Password',{exact:true});
  await password.focus();
  await page.keyboard.press('Tab');
  const toggle=page.getByRole('button',{name:'Tampilkan password'});
  await expect(toggle).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(password).toHaveAttribute('type','text');
});

test('mocked signed-in layout provides a visible keyboard skip link to main content', async ({page}) => {
  // Synthetic browser-only responses: no QA credentials, sessions, or mutations.
  await page.route('**/api/auth/me', route => route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({id:9999,nama:'Accessibility Tester',email:'synthetic@example.invalid',is_platform_admin:false,projects:[]})
  }));
  await page.route('**/api/projects', route => route.fulfill({
    status:200,contentType:'application/json',body:'[]'
  }));
  await page.route('**/api/dashboard/portfolio', route => route.fulfill({
    status:200,contentType:'application/json',body:'[]'
  }));
  await page.setViewportSize({width:375,height:812});
  await page.goto('/projects', {waitUntil:'domcontentloaded'});
  await expect(page.getByRole('main')).toBeVisible();
  const skip=page.getByRole('link',{name:'Lewati navigasi menuju konten utama'});
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#qa-main-content')).toBeFocused();
  const dims=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:window.innerWidth}));
  expect(dims.scroll).toBeLessThanOrEqual(dims.viewport+1);
});
