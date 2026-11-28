import {test, expect} from '@playwright/test';

const routes = [
  '/',
  '/feed',
  '/explore',
  '/theories',
  '/chapters',
  '/episodes',
  '/chat',
  '/p/00000000-0000-4000-8000-000000000001',
  '/u/fictionfan',
  '/series/One%20Piece?medium=manga',
  '/series/One%20Piece/chapter/1100',
  '/tag/character/Luffy',
  '/tag/arc/Egghead'
];
const themes = ['dark', 'light'];
const viewports = [{width: 390, height: 844}, {width: 1440, height: 900}];

for (const theme of themes) {
  for (const viewport of viewports) {
    for (const route of routes) {
      test(`${route} ${theme} ${viewport.width}`, async ({page}) => {
        const errors = [];
        page.on('pageerror', error => {if(!/cloudflareinsights|cdn-cgi\/rum/i.test(error.message))errors.push(error.message);});
        await page.addInitScript(value => localStorage.setItem('fictioncom-theme', value), theme);
        await page.setViewportSize(viewport);
        await page.goto(route, {waitUntil: 'domcontentloaded'});
        await expect.poll(async () => (await page.locator('#content').innerText()).trim().length, {timeout: 30000}).toBeGreaterThan(0);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const dialogOpen = await page.evaluate(() => document.querySelector('#modal')?.open === true);
        expect(dialogOpen).toBe(false);
        if (route.startsWith('/series/One%20Piece?')) {
          await expect(page.locator('.series-hub')).toBeVisible();
          const back = viewport.width < 800 ? page.locator('#topbar-back') : page.locator('#page-back');
          await expect(back).toBeVisible();
        }
        if (route.includes('/chapter/')) await expect(page.locator('.drop-thread')).toBeVisible();
        if (route.startsWith('/tag/')) await expect(page.locator('.tag-page')).toBeVisible();
        expect(errors, errors.join('\n')).toEqual([]);
      });
    }
  }
}

test('series name opens a page, comments and share use sheets', async ({page, browserName}) => {
  test.skip(browserName !== 'chromium', 'interaction check runs once in Chromium');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({width: 1440, height: 900});
  await page.addInitScript(() => localStorage.setItem('fictioncom-theme', 'light'));
  await page.goto('/', {waitUntil: 'domcontentloaded'});
  await page.locator('article').first().waitFor({timeout:20000});
  const series = page.locator('article [data-series]').first();
  if (await series.count()) {
    await series.click();
    await expect(page).toHaveURL(/\/series\//);
    await expect(page.locator('.series-hub')).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('#modal')?.open === true)).toBe(false);
    await page.goto('/');
  }
  const comments = page.locator('article:not(.spoiler-hidden) [data-comments].ig-action').first();
  if (await comments.count()) {
    await comments.click();
    await expect(page.locator('#post-detail')).toBeVisible();
    expect(await page.evaluate(() => document.querySelector('#modal')?.classList.contains('comments-modal'))).toBe(false);
    await page.locator('#post-detail-close').click();
  }
  const share = page.locator('article:not(.spoiler-hidden) [data-share]').first();
  if (await share.count()) {
    await share.click();
    await expect(page.locator('#share-sheet')).toBeVisible();
    await expect(page.locator('#share-sheet-body')).toHaveAttribute('data-url', /^https:\/\/fictioncom\.com\/p\//);
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('phone comment sheet', async ({page, browserName}) => {
  test.skip(browserName !== 'webkit', 'phone sheet check runs in WebKit');
  await page.setViewportSize({width: 390, height: 844});
  await page.addInitScript(() => localStorage.setItem('fictioncom-theme', 'dark'));
  await page.goto('/theories', {waitUntil: 'domcontentloaded'});
  await page.locator('article').first().waitFor({timeout:20000});
  const comments = page.locator('article:not(.spoiler-hidden) [data-comments].ig-action').first();
  test.skip(!(await comments.count()), 'no posts to open comments');
  await comments.click();
  await expect(page.locator('#comment-sheet')).toBeVisible();
  await expect(page.locator('#comment-sheet-handle')).toBeVisible();
  if(await page.locator('#reply-signin').count()) await expect(page.locator('#reply-signin')).toBeVisible();
  else await expect(page.locator('.emoji-picks')).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('#modal')?.open === true)).toBe(false);
});
