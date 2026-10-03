const {test,expect}=require("@playwright/test");
const pages=["/index.html","/application.html","/admit-card.html","/result.html","/online-exam.html","/admin.html"];
for(const path of pages){
  test(`${path} loads without a server 404 or JavaScript error`,async({page})=>{
    const errors=[];
    page.on("pageerror",err=>errors.push(String(err?.message||err)));
    const response=await page.goto(path,{waitUntil:"domcontentloaded"});
    expect(response&&response.status()).not.toBe(404);
    await expect(page.locator("body")).toBeVisible();
    expect(errors,path).toEqual([]);
  });
}
test("/application-dashboard.html redirects unauthenticated visitors",async({page})=>{
  const errors=[];
  page.on("pageerror",err=>errors.push(String(err?.message||err)));
  const response=await page.goto("/application-dashboard.html",{waitUntil:"domcontentloaded"});
  expect(response&&response.status()).not.toBe(404);
  await expect(page).toHaveURL(/\/application\.html(?:\?|$)/);
  expect(errors.filter(message=>message!=="No application"),"/application-dashboard.html").toEqual([]);
});
test("main navigation has no broken local links",async({page})=>{
  await page.goto("/index.html",{waitUntil:"domcontentloaded"});
  const hrefs=await page.locator("a[href]").evaluateAll(as=>as.map(a=>a.getAttribute("href")).filter(h=>h&&/^[^#?][^:]*\.html(?:\?.*)?$/.test(h)));
  for(const href of hrefs){
    const path=href.split("?")[0];
    const res=await page.request.get(new URL(path,"http://127.0.0.1:5000").toString());
    expect(res.status(),path).toBe(200);
  }
});
test("candidate application remains usable at mobile width",async({page})=>{
  await page.goto("/application.html",{waitUntil:"domcontentloaded"});
  const width=await page.locator("body").evaluate(el=>el.scrollWidth);
  const viewport=await page.evaluate(()=>window.innerWidth);
  expect(width).toBeLessThanOrEqual(viewport+3);
});

test("candidate credential recovery controls are present on all access pages",async({page})=>{
  for(const path of ["/application.html","/admit-card.html","/result.html"]){
    await page.goto(path,{waitUntil:"domcontentloaded"});
    await expect(page.locator('[data-recovery="application"]')).toHaveCount(1);
    await expect(page.locator('[data-recovery="password"]')).toHaveCount(1);
  }
});
