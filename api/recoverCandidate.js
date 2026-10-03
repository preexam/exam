const { auth, db } = require("./_lib/firebase-admin");

const ALLOWED_ORIGINS=new Set(["https://preexam.github.io","https://bookesh.co","https://www.bookesh.co","https://exam-henna-two.vercel.app"]);

function json(res,data,status,req){
  const origin=req.headers?.origin||"";
  if(ALLOWED_ORIGINS.has(origin))res.setHeader("Access-Control-Allow-Origin",origin);
  res.setHeader("Vary","Origin");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
  res.setHeader("Content-Type","application/json");
  res.statusCode=status;
  res.end(JSON.stringify(data));
}
function bodyOf(req){return typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});}
function validDob(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+"T00:00:00");
  const today=new Date();today.setHours(0,0,0,0);
  return !Number.isNaN(d.getTime())&&d<=today;
}

module.exports=async function handler(req,res){
  if(req.method==="OPTIONS")return json(res,{},204,req);
  if(req.method!=="POST")return json(res,{error:"Method Not Allowed"},405,req);
  try{
    const body=bodyOf(req);
    const mode=body.mode==="password"?"password":"application";
    const mobile=String(body.mobile||"").trim();
    const dob=String(body.dob||"").trim();
    const newPassword=String(body.newPassword||"");

    if(!/^\d{10}$/.test(mobile))return json(res,{error:"Mobile number must be exactly 10 digits."},400,req);
    if(!validDob(dob))return json(res,{error:"Please enter a valid date of birth."},400,req);
    if(mode==="password"&&newPassword.length<8)return json(res,{error:"New password must be at least 8 characters."},400,req);

    const snap=await db.collection("candidates").where("mobile","==",mobile).limit(10).get();
    const matches=snap.docs.filter(doc=>{
      const data=doc.data();
      return String(data.dob||"")===dob&&data.authUid===doc.id&&data.applicationNumber;
    });
    if(matches.length!==1){
      return json(res,{error:"The mobile number and date of birth do not match a registered candidate."},404,req);
    }

    const candidate=matches[0].data();
    const uid=matches[0].id;
    if(mode==="password"){
      await auth.updateUser(uid,{password:newPassword});
      await auth.revokeRefreshTokens(uid);
      return json(res,{success:true,applicationNumber:candidate.applicationNumber},200,req);
    }
    return json(res,{success:true,applicationNumber:candidate.applicationNumber},200,req);
  }catch(error){
    console.error("recoverCandidate",error);
    return json(res,{error:"We could not complete the recovery request. Please try again."},500,req);
  }
};
