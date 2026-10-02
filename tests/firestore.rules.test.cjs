const fs=require("fs");
const assert=require("assert");
const {initializeTestEnvironment,assertFails,assertSucceeds}=require("@firebase/rules-unit-testing");
const {doc,setDoc,getDoc,updateDoc}=require("firebase/firestore");
const {ref,uploadBytes,getMetadata}=require("firebase/storage");

describe("Firestore production security rules",function(){
  this.timeout(30000);
  let env;
  before(async()=>{
    env=await initializeTestEnvironment({
      projectId:"exam-9f830",
      firestore:{rules:fs.readFileSync("firestore.rules","utf8")},
      storage:{rules:fs.readFileSync("storage.rules","utf8"),bucket:"exam-9f830.appspot.com"}
    });
    await env.withSecurityRulesDisabled(async ctx=>{
      const db=ctx.firestore();
      await setDoc(doc(db,"settings","portal"),{activeExamId:"ONLINE"});
      await setDoc(doc(db,"exams","ONLINE"),{examName:"Online Test",onlineExamEnabled:true,onlineExamPublished:true,onlineExamDuration:30,onlineExamMaxAttempts:1,paymentRequired:true});
      await setDoc(doc(db,"applications","APP100"),{applicationNumber:"APP100",authUid:"candidate-1",candidateId:"candidate-1",status:"Approved",paymentStatus:"Successful",examId:"ONLINE",createdAt:new Date()});
      await setDoc(doc(db,"applications","APP200"),{applicationNumber:"APP200",authUid:"candidate-2",candidateId:"candidate-2",status:"Approved",paymentStatus:"Successful",createdAt:new Date()});
      await setDoc(doc(db,"admitCards","APP100"),{authUid:"candidate-1",published:false});
      await setDoc(doc(db,"results","APP100"),{authUid:"candidate-1",published:false});
      await setDoc(doc(db,"onlineAnswerKeys","ONLINE","items","q1"),{correct:"A",marks:1});
      await setDoc(doc(db,"onlineAttempts","ONLINE_APP100"),{applicationNumber:"APP100",authUid:"candidate-1",examId:"ONLINE",status:"In Progress",answers:{},startedAt:new Date(),expiresAt:new Date(Date.now()+1800000)});
      await setDoc(doc(db,"onlineAttempts","ONLINE_APP100","questions","q1"),{question:"2+2?",options:["4","5","6","7"],marks:1,order:1});
      await setDoc(doc(db,"onlineAttempts","EXPIRED_APP100"),{applicationNumber:"APP100",authUid:"candidate-1",examId:"EXPIRED",status:"In Progress",answers:{},startedAt:new Date(Date.now()-3600000),expiresAt:new Date(Date.now()-10000)});
    });
  });
  after(async()=>{if(env)await env.cleanup()});
  it("allows public exam metadata but not private application data",async()=>{
    const anon=env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon,"exams","ONLINE")));
    await assertFails(getDoc(doc(anon,"applications","APP100")));
  });
  it("blocks candidate-created payment/status/exam spoofing on application creation",async()=>{
    const c1=env.authenticatedContext("candidate-1").firestore();
    await assertFails(setDoc(doc(c1,"applications","FAKEPAY"),{
      applicationNumber:"FAKEPAY",
      authUid:"candidate-1",
      candidateId:"candidate-1",
      status:"Application Incomplete",
      paymentStatus:"Successful",
      examId:"ONLINE",
      personal:{fullName:"Attacker",dob:"2000-01-01",mobile:"9999999999"},
      createdAt:new Date(),
      updatedAt:new Date()
    }));
    await assertFails(setDoc(doc(c1,"applications","FAKEEXAM"),{
      applicationNumber:"FAKEEXAM",
      authUid:"candidate-1",
      candidateId:"candidate-1",
      status:"Application Incomplete",
      paymentStatus:"Pending",
      examId:"NOT_ACTIVE",
      personal:{fullName:"Attacker",dob:"2000-01-01",mobile:"9999999999"},
      createdAt:new Date(),
      updatedAt:new Date()
    }));
    await assertFails(setDoc(doc(c1,"applications","FAKESTATUS"),{
      applicationNumber:"FAKESTATUS",
      authUid:"candidate-1",
      candidateId:"candidate-1",
      status:"Final Submitted",
      paymentStatus:"Pending",
      examId:"ONLINE",
      personal:{fullName:"Attacker",dob:"2000-01-01",mobile:"9999999999"},
      createdAt:new Date(),
      updatedAt:new Date()
    }));
    await assertSucceeds(setDoc(doc(c1,"applications","VALIDAPP"),{
      applicationNumber:"VALIDAPP",
      authUid:"candidate-1",
      candidateId:"candidate-1",
      status:"Application Incomplete",
      paymentStatus:"Pending",
      examId:"ONLINE",
      personal:{fullName:"Candidate",dob:"2000-01-01",mobile:"9999999999"},
      createdAt:new Date(),
      updatedAt:new Date()
    }));
  });
  it("allows a candidate to read only their own attempt paper",async()=>{
    const c1=env.authenticatedContext("candidate-1").firestore();
    const c2=env.authenticatedContext("candidate-2").firestore();
    await assertSucceeds(getDoc(doc(c1,"onlineAttempts","ONLINE_APP100")));
    await assertSucceeds(getDoc(doc(c1,"onlineAttempts","ONLINE_APP100","questions","q1")));
    await assertFails(getDoc(doc(c1,"onlineAnswerKeys","ONLINE","items","q1")));
    await assertFails(getDoc(doc(c2,"onlineAttempts","ONLINE_APP100")));
  });
  it("prevents candidate result/admit reads before publication",async()=>{
    const c1=env.authenticatedContext("candidate-1").firestore();
    await assertFails(getDoc(doc(c1,"admitCards","APP100")));
    await assertFails(getDoc(doc(c1,"results","APP100")));
  });
  it("prevents a candidate from starting an online exam for another exam",async()=>{
    const c1=env.authenticatedContext("candidate-1").firestore();
    await assertFails(setDoc(doc(c1,"onlineAttempts","OTHER_APP100"),{
      applicationNumber:"APP100",authUid:"candidate-1",examId:"OTHER",status:"Starting",answers:{}
    }));
  });
  it("rejects a non-canonical duplicate online attempt id",async()=>{
    const c1=env.authenticatedContext("candidate-1").firestore();
    await assertFails(setDoc(doc(c1,"onlineAttempts","SECOND_ATTEMPT"),{
      applicationNumber:"APP100",authUid:"candidate-1",examId:"ONLINE",status:"Starting",answers:{}
    }));
  });
  it("blocks late candidate submission after the exam expiry grace window",async()=>{
    const c1=env.authenticatedContext("candidate-1").firestore();
    await assertFails(updateDoc(doc(c1,"onlineAttempts","EXPIRED_APP100"),{
      status:"Submitted",
      submittedAt:new Date(),
      autoSubmitted:false,
      currentIndex:0,
      updatedAt:new Date()
    }));
  });
  it("prevents candidates from changing document verification state",async()=>{
    const c1=env.authenticatedContext("candidate-1").firestore();
    await assertFails(updateDoc(doc(c1,"applications","APP100"),{documentVerification:{photo:"Verified"}}));
  });
  it("prevents candidate from changing protected attempt fields",async()=>{
    const c1=env.authenticatedContext("candidate-1").firestore();
    await assertFails(updateDoc(doc(c1,"onlineAttempts","ONLINE_APP100"),{score:999,graded:true}));
  });
  it("enforces candidate-owned Storage paths and file constraints",async()=>{
    const c1=env.authenticatedContext("candidate-1");
    const c2=env.authenticatedContext("candidate-2");
    const file=new Uint8Array([1,2,3,4]);
    await assertSucceeds(uploadBytes(ref(c1.storage(),"applications/APP100/photo.jpg"),file,{contentType:"image/jpeg"}));
    await assertFails(getMetadata(ref(c2.storage(),"applications/APP100/photo.jpg")));
    await assertFails(uploadBytes(ref(c1.storage(),"applications/APP200/bad.txt"),file,{contentType:"text/plain"}));
  });
});
