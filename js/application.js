import {auth,db,doc,getDoc,setDoc,serverTimestamp,signInWithEmailAndPassword,createUserWithEmailAndPassword,showMsg,appNo,getSettings,getActiveExam,examLifecycle,signOut} from "./firebase.js";
const $=s=>document.querySelector(s);
document.querySelectorAll("[data-auth-tab]").forEach(tab=>{
  tab.onclick=()=>{
    document.querySelectorAll("[data-auth-tab]").forEach(x=>x.classList.toggle("active",x===tab));
    document.querySelectorAll("[data-auth-panel]").forEach(x=>x.classList.toggle("active",x.dataset.authPanel===tab.dataset.authTab));
  };
});
function openAuthTab(name){document.querySelector(`[data-auth-tab="${name}"]`)?.click();}
const regMobile=$("#regMobile"),regMsg=$("#regMsg");
$("#registerForm").onsubmit=async e=>{
  e.preventDefault();
  const settings=await getSettings(),exam=await getActiveExam(settings),life=examLifecycle(exam);
  if(settings.maintenanceMode||settings.applicationOpen===false||life.applicationOpen===false){
    showMsg(regMsg,settings.maintenanceMode?"Portal is under maintenance.":"Applications are currently closed or outside the application window.",true);return;
  }
  const name=$("#regName").value.trim(),dob=$("#regDob").value,mobile=regMobile.value.trim(),password=$("#regPassword").value,confirmPassword=$("#regPasswordConfirm").value;
  if(name.length<2){showMsg(regMsg,"Enter a valid full name.",true);return}
  if(!/^\d{10}$/.test(mobile)){showMsg(regMsg,"Mobile number must be exactly 10 digits.",true);return}
  if(!dob){showMsg(regMsg,"Date of birth is required.",true);return}
  const dobDate=new Date(dob+"T00:00:00"),today=new Date();today.setHours(0,0,0,0);
  if(Number.isNaN(dobDate.getTime())||dobDate>today){showMsg(regMsg,"Date of birth cannot be in the future.",true);return}
  if(password.length<6){showMsg(regMsg,"Password must be at least 6 characters.",true);return}\n  if(password!==confirmPassword){showMsg(regMsg,"Password and Confirm Password do not match.",true);return}
  try{
    const applicationNumber=appNo(settings.applicationPrefix),email=`${applicationNumber.toLowerCase()}@candidate.examportal.local`;
    const created=await createUserWithEmailAndPassword(auth,email,password);
    const user=created.user;
    await setDoc(doc(db,"candidates",user.uid),{applicationNumber,authUid:user.uid,name,dob,mobile,status:"Registered",createdAt:serverTimestamp()});
    await setDoc(doc(db,"applications",applicationNumber),{applicationNumber,authUid:user.uid,candidateId:user.uid,personal:{fullName:name,dob,mobile},status:"Application Incomplete",paymentStatus:"Pending",examId:exam?.id||settings.activeExamId||"default",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await signOut(auth);
    showMsg(regMsg,`Registration successful. Your Application Number is ${applicationNumber}. Please sign in to continue.`);
    $("#loginApp").value=applicationNumber;
    openAuthTab("signin");
  }catch(err){
    showMsg(regMsg,err?.code==="auth/email-already-in-use"?"Registration failed. Please try again.":err?.message||"Registration failed. Please try again.",true);
  }
};
$("#loginForm").onsubmit=async e=>{
  e.preventDefault();
  const n=$("#loginApp").value.trim().toUpperCase();
  try{
    await signInWithEmailAndPassword(auth,`${n.toLowerCase()}@candidate.examportal.local`,$("#loginPass").value);
    const a=await getDoc(doc(db,"applications",n));
    if(!a.exists()||a.data().authUid!==auth.currentUser?.uid){await signOut(auth);showMsg($("#loginMsg"),"Application not found or access denied.",true);return}
    sessionStorage.setItem("candidateApp",n);location.href="application-dashboard.html";
  }catch(e){showMsg($("#loginMsg"),"Login failed. Check Application Number and Password.",true)}
};
