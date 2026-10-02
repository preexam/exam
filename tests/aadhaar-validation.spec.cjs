const {test,expect}=require("@playwright/test");
const fs=require("fs");
const path=require("path");
const vm=require("vm");

function loadAadhaarValidator(){
  const source=fs.readFileSync(path.join(process.cwd(),"js","application-dashboard.js"),"utf8");
  const match=source.match(/function aadhaarValid\(v\)\{[\s\S]*?\n\}/);
  if(!match)throw new Error("aadhaarValid function not found");
  const context={};
  vm.createContext(context);
  return vm.runInContext("(function(){"+match[0]+";return aadhaarValid;})()",context);
}

test("Aadhaar validator accepts valid Verhoeff numbers and rejects invalid ones",async()=>{
  const aadhaarValid=loadAadhaarValidator();
  expect(aadhaarValid("234567890124")).toBe(true);
  expect(aadhaarValid("635121545811")).toBe(true);
  expect(aadhaarValid("234567890123")).toBe(false);
  expect(aadhaarValid("635121545812")).toBe(false);
  expect(aadhaarValid("134567890123")).toBe(false);
  expect(aadhaarValid("63512154581")).toBe(false);
});
