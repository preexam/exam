const { admin, db, auth } = require("./_lib/firebase-admin");

const allowedOrigins = new Set([
  "https://preexam.github.io",
  "https://bookesh.co",
  "https://www.bookesh.co"
]);

function setCors(req,res){
  const origin=req.headers?.origin||"";
  res.setHeader("Vary","Origin");
  if(allowedOrigins.has(origin))res.setHeader("Access-Control-Allow-Origin",origin);
  res.setHeader("Access-Control-Allow-Headers","Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods","POST, OPTIONS");
}

async function requireApplicationsAdmin(req){
  const header=req.headers?.authorization||"";
  if(!header.startsWith("Bearer "))throw new Error("Authentication required.");
  const user=await auth.verifyIdToken(header.slice(7));
  const snap=await db.doc("admins/"+user.uid).get();
  if(!snap.exists||snap.data().active!==true)throw new Error("Admin access denied.");
  const data=snap.data();
  if(data.role==="superadmin"||data.permissions?.all===true||data.permissions?.applications===true)return user;
  throw new Error("Applications permission is required.");
}

function json(res,data,status){res.statusCode=status;res.setHeader("Content-Type","application/json");res.end(JSON.stringify(data));}

module.exports=async function handler(req,res){
  setCors(req,res);
  if(req.method==="OPTIONS"){res.statusCode=204;return res.end();}
  if(req.method!=="POST")return json(res,{error:"Method Not Allowed"},405);
  try{
    await requireApplicationsAdmin(req);
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const candidateId=String(body.candidateId||"").trim();
    const applicationNumber=String(body.applicationNumber||"").trim();
    if(!candidateId)return json(res,{error:"Candidate ID is required."},400);

    const candidateRef=db.doc("candidates/"+candidateId);
    const candidateSnap=await candidateRef.get();
    if(!candidateSnap.exists)return json(res,{error:"Candidate not found."},404);
    const candidate=candidateSnap.data();
    const appNo=applicationNumber||String(candidate.applicationNumber||"");
    const appRef=appNo?db.doc("applications/"+appNo):null;
    const appSnap=appRef?await appRef.get():null;
    const app=appSnap?.exists?appSnap.data():null;

    if(app?.paymentStatus==="Successful")return json(res,{error:"Paid applications cannot be deleted. Use the normal admin correction/verification workflow instead."},409);
    if(["Final Submitted","Approved"].includes(app?.status))return json(res,{error:"Submitted or approved applications cannot be deleted."},409);

    const [payments,admitCards,results]=await Promise.all([
      appNo?db.collection("payments").where("applicationNumber","==",appNo).get():Promise.resolve({docs:[]}),
      appNo?db.collection("admitCards").where("applicationNumber","==",appNo).get():Promise.resolve({docs:[]}),
      appNo?db.collection("results").where("__name__","==",appNo).get():Promise.resolve({docs:[]})
    ]);

    if(admitCards.docs.some(d=>d.data().published===true))return json(res,{error:"A published admit card exists. Unpublish it before deleting this candidate."},409);
    if(results.docs.some(d=>d.data().published===true))return json(res,{error:"A published result exists. Unpublish it before deleting this candidate."},409);

    const refs=[candidateRef];
    if(appRef&&appSnap?.exists)refs.push(appRef);
    payments.docs.forEach(d=>refs.push(d.ref));
    admitCards.docs.forEach(d=>refs.push(d.ref));
    results.docs.forEach(d=>refs.push(d.ref));

    for(let i=0;i<refs.length;i+=400){
      const batch=db.batch();
      refs.slice(i,i+400).forEach(ref=>batch.delete(ref));
      await batch.commit();
    }

    let authDeleted=false;
    try{await auth.deleteUser(candidateId);authDeleted=true;}catch(error){
      if(error?.code!=="auth/user-not-found")throw error;
    }

    return json(res,{success:true,deletedRecords:{
      candidate:1,
      application:appSnap?.exists?1:0,
      payments:payments.docs.length,
      admitCards:admitCards.docs.length,
      results:results.docs.length,
      authUser:authDeleted?1:0
    }},200);
  }catch(error){
    console.error("adminDeleteCandidate",error);
    const message=error?.message||"Unable to delete candidate.";
    return json(res,{error:message},message==="Authentication required."?401:message==="Admin access denied."?403:500);
  }
};
