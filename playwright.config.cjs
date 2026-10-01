const {defineConfig,devices}=require("@playwright/test");
module.exports=defineConfig({
  testDir:"./tests",
  testMatch:"**/*.spec.cjs",
  timeout:30000,
  use:{baseURL:"http://127.0.0.1:5000",trace:"retain-on-failure"},
  projects:[
    {name:"desktop",use:{...devices["Desktop Chrome"]}},
    {name:"mobile",use:{...devices["iPhone 13"]}}
  ]
});