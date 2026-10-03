const { auth, db, admin } = require("./_lib/firebase-admin");

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
function validDateOfBirth(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const d=new Date(value+"T00:00:00");
  if(Number.isNaN(d.getTime()))return false;
  const now=new Date();now.setHours(0,0,0,0);
  return d<=now;
}
function createApplicationNumber(prefix){
  const safe=String(prefix||"EXAM").replace(/[^A-Za-z0-9]/g,"").slice(0,12)||"EXAM";
  return safe+crypto.randomUUID().replace(/-/g,"").slice(0,14).toUpperCase();
}
const crypto=require("crypto");

module.exports=async function handler(req,res){
  if(req.method==="OPTIONS")return json(res,{},204,req);
  if(req.method!=="POST")return json(res,{error:"Method Not Allowed"},405,req);
  let createdUid=null;
  try{
    const body=bodyOf(req);
    const name=String(body.name||"").trim();
    const dob=String(body.dob||"").trim();
    const mobile=String(body.mobile||"").trim();
    const password=String(body.password||"");
    if(name.length<2)return json(res,{error:"Please enter a valid full name."},400,req);
    if(!/^\d{10}$/.test(mobile))return json(res,{error:"Mobile number must be exactly 10 digits."},400,req);
    if(!validDateOfBirth(dob))return json(res,{error:"Please enter a valid date of birth."},400,req);
    if(password.length<6)return json(res,{error:"Password must be at least 6 characters."},400,req);

    const settingsSnap=await db.doc("settings/portal").get();
    const settings=settingsSnap.exists?settingsSnap.data():{};
    if(settings.maintenanceMode||settings.applicationOpen===false){
      return json(res,{error:"Applications are currently closed."},412,req);
    }
    let activeExamId=String(settings.activeExamId||"").trim();
    let exam=null;

    // Prefer the Admin-selected active exam. If the setting is still "default"
    // or points to a missing exam, recover gracefully by selecting the newest
    // non-closed exam whose application window is currently open.
    if(activeExamId && activeExamId!=="default"){
      const examSnap=await db.doc("exams/"+activeExamId).get();
      if(examSnap.exists)exam={id:examSnap.id,...examSnap.data()};
    }

    if(!exam){
      const examsSnap=await db.collection("exams").get();
      const now=Date.now();
      const openExams=examsSnap.docs
        .map(s=>({id:s.id,...s.data()}))
        .filter(x=>x.status!=="Closed"&&x.status!=="Archived")
        .filter(x=>{
          const start=Number(x.applicationStartMs)||Date.parse(x.applicationStart||"");
          const end=Number(x.applicationEndMs)||Date.parse(x.applicationEnd||"");
          return (!Number.isFinite(start)||now>=start)&&(!Number.isFinite(end)||now<=end);
        })
        .sort((a,b)=>{
          const aStart=Number(a.applicationStartMs)||Date.parse(a.applicationStart||"")||0;
          const bStart=Number(b.applicationStartMs)||Date.parse(b.applicationStart||"")||0;
          return bStart-aStart;
        });
      exam=openExams[0]||null;
      if(exam)activeExamId=exam.id;
    }

    if(!exam||!activeExamId){
      return json(res,{error:"Exam configuration is not available. Please open a valid exam application window in the Admin panel."},412,req);
    }

    const now=Date.now();
    const start=Number(exam.applicationStartMs)||Date.parse(exam.applicationStart||"");
    const end=Number(exam.applicationEndMs)||Date.parse(exam.applicationEnd||"");
    if((Number.isFinite(start)&&now<start)||(Number.isFinite(end)&&now>end)){
      return json(res,{error:"Applications are currently closed or outside the application window."},412,req);
    }

    const existing=await db.collection("candidates").where("mobile","==",mobile).limit(1).get();
    if(!existing.empty)return json(res,{error:"This mobile number is already registered. Please use Sign In or Forgot Application Number."},409,req);

    const prefix=settings.applicationPrefix||"EXAM";
    let applicationNumber="";
    for(let i=0;i<5;i++){
      const candidate=createApplicationNumber(prefix);
      const snap=await db.doc("applications/"+candidate).get();
      if(!snap.exists){applicationNumber=candidate;break;}
    }
    if(!applicationNumber)return json(res,{error:"Unable to create an application number. Please try again."},500,req);

    const email=applicationNumber.toLowerCase()+"@candidate.examportal.local";
    const user=await auth.createUser({
      email,
      password,
      phoneNumber:"+91"+mobile,
      displayName:name,
      emailVerified:false
    });
    createdUid=user.uid;

    await db.runTransaction(async tx=>{
      const candidateRef=db.doc("candidates/"+user.uid);
      const applicationRef=db.doc("applications/"+applicationNumber);
      const mobileCheck=await tx.get(db.collection("candidates").where("mobile","==",mobile).limit(2));
      if(!mobileCheck.empty)throw new Error("This mobile number is already registered.");
      tx.set(candidateRef,{
        applicationNumber,
        authUid:user.uid,
        name,
        dob,
        mobile,
        status:"Registered",
        createdAt:admin.firestore.FieldValue.serverTimestamp()
      });
      tx.set(applicationRef,{
        applicationNumber,
        authUid:user.uid,
        candidateId:user.uid,
        personal:{fullName:name,dob,mobile},
        status:"Application Incomplete",
        paymentStatus:"Pending",
        examId:activeExamId,
        createdAt:admin.firestore.FieldValue.serverTimestamp(),
        updatedAt:admin.firestore.FieldValue.serverTimestamp()
      });
    });

    return json(res,{success:true,applicationNumber},200,req);
  }catch(error){
    if(createdUid){try{await auth.deleteUser(createdUid);}catch(cleanupError){console.error("registerCandidate cleanup",cleanupError)}}
    console.error("registerCandidate",error);
    const message=error?.code==="auth/phone-number-already-exists"?"This mobile number is already registered. Please use Sign In or Forgot Application Number.":error?.message||"Registration failed. Please try again.";
    return json(res,{error:message},message.includes("already registered")?409:500,req);
  }
};
