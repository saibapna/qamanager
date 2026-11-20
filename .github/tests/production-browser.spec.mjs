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
