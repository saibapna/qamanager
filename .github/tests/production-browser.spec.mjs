import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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


async function assertWcag21Aa(page, surface) {
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
  const errors=results.violations.map(v=>({
    id:v.id,
    impact:v.impact,
    description:v.description,
    targets:v.nodes.map(n=>n.target.join(' ')).slice(0,5)
  }));
  expect(errors, 'WCAG 2.1 AA violations on '+surface).toEqual([]);
}

test('WCAG 2.1 AA: production unauthenticated login controls', async ({page}) => {
  await page.goto('/login', {waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'ULO/UAT Manager'})).toBeVisible();
  await assertWcag21Aa(page,'login');
});

test('WCAG 2.1 AA: mobile login controls', async ({page}) => {
  await page.setViewportSize({width:375,height:812});
  await page.goto('/login', {waitUntil:'domcontentloaded'});
  await expect(page.getByLabel('Email',{exact:true})).toBeVisible();
  await assertWcag21Aa(page,'mobile login');
});

test('WCAG 2.1 AA: authenticated-looking project dashboard (synthetic browser mock)', async ({page}) => {
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
  await page.goto('/projects', {waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Projects'})).toBeVisible();
  await assertWcag21Aa(page,'mocked project dashboard');
});


async function installSyntheticAuthenticatedUi(page) {
  const project={id:1,kode:'DEMO',nama:'Project E2E Sintetik',instansi:'Instansi Sintetik',bidang:null,aktif:true};
  const person={id:9999,nama:'Penguji Sintetik',email:'synthetic@example.invalid',aktif:true,is_platform_admin:false,
    projects:[{project_id:1,kode:'DEMO',nama:project.nama,role:'ADMIN'}]};
  const plan=[{no:'A1',kategori:'A',kebutuhan:'Pengujian login contoh',urutan:1,gate_required:false},
    {no:'A2',kategori:'A',kebutuhan:'Pengujian pencarian contoh',urutan:2,gate_required:false}];
  const template={id:10,versi:'1.0',nama:'Template Sintetik',published:true};
  const storage={evidence:{objects:0,total_bytes:0,limit_bytes:268435456},
    fixtures:{objects:0,total_bytes:0,limit_bytes:104857600},
    pdf:{objects:0,total_bytes:0,limit_bytes:268435456},
    note:'Testing synthetic values'};
  const paths={
    '/api/auth/me':person,
    '/api/projects':[project],
    '/api/dashboard/portfolio':[{
      ...project,total_sessions:0,signed_sessions:0,total_items:0,pass_items:0,
      fail_items:0,pending_items:0,open_defects:0,awaiting_witness:0,
      awaiting_approver:0,rejected_decisions:0
    }],
    '/api/projects/1':project,
    '/api/projects/1/dashboard':{
      sessions:{total:0,drafts:0,finals:0,signed:0},
      items:{total:0,pass:0,fail:0,belum:0},
      defects:{total:0,unresolved:0},
      approvals:{awaiting_witness:0,awaiting_approver:0,rejected_decisions:0}
    },
    '/api/projects/1/storage-usage':storage,
    '/api/projects/1/members':[{
      id:9999,nama:person.nama,email:person.email,role:'ADMIN',aktif:true
    }],
    '/api/projects/1/people':[],
    '/api/projects/1/plan':plan,
    '/api/projects/1/audit':[],
    '/api/projects/1/templates':[template],
    '/api/projects/1/aplikasi':[{
      id:22,project_id:1,nama_singkat:'DEMO APP',nama_panjang:'Aplikasi Sintetik',url:null
    }],
    '/api/projects/1/live-dashboard':[],
    '/api/aplikasi/22/sesi':[]
  };
  await page.route('**/api/**', route=>{
    const pathname=new URL(route.request().url()).pathname;
    return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify(Object.prototype.hasOwnProperty.call(paths,pathname)?paths[pathname]:[])});
  });
}

test('WCAG 2.1 AA: synthetic admin project operations in each management tab', async ({page})=>{
  await installSyntheticAuthenticatedUi(page);
  await page.goto('/projects/1/manage',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Pengelolaan Project'})).toBeVisible();
  for(const tab of ['Dashboard','Anggota & Role','Penguji & Saksi','Test Plan','Audit Trail']){
    await page.getByRole('button',{name:tab,exact:true}).click();
    await assertWcag21Aa(page,'synthetic project operations '+tab);
  }
});

test('WCAG 2.1 AA: synthetic project detail and application cards',async ({page})=>{
  await installSyntheticAuthenticatedUi(page);
  await page.goto('/projects/1',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Project E2E Sintetik'})).toBeVisible();
  await assertWcag21Aa(page,'synthetic project detail');
});

test('WCAG 2.1 AA: synthetic PDF validation form',async ({page})=>{
  await installSyntheticAuthenticatedUi(page);
  await page.goto('/validate',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Validasi PDF'})).toBeVisible();
  await assertWcag21Aa(page,'synthetic PDF validation');
});

test('WCAG 2.1 AA: synthetic PDF validation mobile width does not overflow',async ({page})=>{
  await installSyntheticAuthenticatedUi(page);
  await page.setViewportSize({width:375,height:812});
  await page.goto('/validate',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'Validasi PDF'})).toBeVisible();
  const dimensions=await page.evaluate(()=>({
    scroll:document.documentElement.scrollWidth,viewport:window.innerWidth
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport+1);
  await assertWcag21Aa(page,'synthetic mobile PDF validation');
});

test('WCAG 2.1 AA: portfolio with an authorized project',async ({page})=>{
  await installSyntheticAuthenticatedUi(page);
  await page.goto('/projects',{waitUntil:'domcontentloaded'});
  await expect(page.getByText('Project E2E Sintetik',{exact:true})).toBeVisible();
  await assertWcag21Aa(page,'synthetic authorized portfolio');
});
