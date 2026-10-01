const {test,expect}=require("@playwright/test");
const pages=["/index.html","/application.html","/application-dashboard.html","/admit-card.html","/result.html","/online-exam.html","/admin.html"];
for(const path of pages){
  test(`${path} loads without a server 404`,async({page})=>{
    const response=await page.goto(path,{waitUntil:"domcontentloaded"});
    expect(response&&response.status()).not.toBe(404);
    await expect(page.locator("body")).toBeVisible();
  });
}
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
  expect(width).toBeLessThanOrEqual(viewport+2);
});
