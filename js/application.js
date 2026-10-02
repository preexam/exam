import {auth,db,doc,getDoc,setDoc,serverTimestamp,signInWithEmailAndPassword,clean,showMsg,appNo,getSettings,getActiveExam,examLifecycle,EmailAuthProvider,linkWithCredential,RecaptchaVerifier,signInWithPhoneNumber,signOut} from "./firebase.js";
const $=s=>document.querySelector(s);
document.querySelectorAll("[data-auth-tab]").forEach(tab=>{
  tab.onclick=()=>{
    document.querySelectorAll("[data-auth-tab]").forEach(x=>x.classList.toggle("active",x===tab));
    document.querySelectorAll("[data-auth-panel]").forEach(x=>x.classList.toggle("active",x.dataset.authPanel===tab.dataset.authTab));
  };
});
function openAuthTab(name){
  document.querySelector(`[data-auth-tab="${name}"]`)?.click();
}
let confirmationResult=null,otpVerified=false,recaptchaVerifier=null,otpSending=false;
const sendOtp=$("#sendOtp"),otpInput=$("#otp"),regMobile=$("#regMobile"),regMsg=$("#regMsg");
function phoneNumber(){
  const mobile=regMobile.value.trim();
  return /^\\d{10}$/.test(mobile)?`+91${mobile}`:null;
}
function setOtpState(verified=false){
  otpVerified=verified;
  sendOtp.disabled=verified;
  sendOtp.textContent=verified?"Mobile Verified":"Verify Mobile";
  otpInput.disabled=verified;
  regMobile.disabled=verified;
}
async function ensureRecaptcha(){
  if(recaptchaVerifier)return recaptchaVerifier;
  recaptchaVerifier=new RecaptchaVerifier(auth,"recaptcha-container",{size:"invisible"});
  await recaptchaVerifier.render();
  return recaptchaVerifier;
}
sendOtp.onclick=async()=>{
  if(otpSending||otpVerified)return;
  const phone=phoneNumber();
  if(!phone){showMsg(regMsg,"Enter a valid 10-digit mobile number first.",true);regMobile.focus();return}
  otpSending=true;sendOtp.disabled=true;regMobile.disabled=true;showMsg(regMsg,"Sending verification code...");
  try{
    const appVerifier=await ensureRecaptcha();
    confirmationResult=await signInWithPhoneNumber(auth,phone,appVerifier);
    otpInput.value="";
    otpInput.disabled=false;
    showMsg(regMsg,"Verification code sent to your mobile. Enter the 6-digit code.");
    otpInput.focus();
  }catch(err){
    confirmationResult=null;
    regMobile.disabled=false;
    try{recaptchaVerifier?.clear()}catch{}
    recaptchaVerifier=null;
    showMsg(regMsg,err?.message||"Could not send verification code. Please try again.",true);
  }finally{
    otpSending=false;
    if(!otpVerified)sendOtp.disabled=false;
  }
};
otpInput.oninput=async()=>{
  const code=otpInput.value.replace(/\\D/g,"").slice(0,6);
  if(otpInput.value!==code)otpInput.value=code;
  if(code.length!==6||!confirmationResult||otpVerified)return;
  otpInput.disabled=true;
  showMsg(regMsg,"Verifying mobile number...");
  try{
    await confirmationResult.confirm(code);
    otpVerified=true;
    confirmationResult=null;
    setOtpState(true);
    showMsg(regMsg,"Mobile number verified successfully.");
  }catch(err){
    otpInput.disabled=false;
    showMsg(regMsg,err?.message||"Invalid verification code. Please try again.",true);
  }
};
$("#registerForm").onsubmit=async e=>{
  e.preventDefault();
  const settings=await getSettings(),exam=await getActiveExam(settings),life=examLifecycle(exam);
  if(settings.maintenanceMode||settings.applicationOpen===false||life.applicationOpen===false){showMsg(regMsg,settings.maintenanceMode?"Portal is under maintenance.":"Applications are currently closed or outside the application window.",true);return}
  const name=$("#regName").value.trim(),dob=$("#regDob").value,mobile=regMobile.value.trim(),password=$("#regPassword").value;
  if(name.length<2){showMsg(regMsg,"Enter a valid full name.",true);return}
  if(!/^\\d{10}$/.test(mobile)){showMsg(regMsg,"Mobile number must be exactly 10 digits.",true);return}
  if(!dob){showMsg(regMsg,"Date of birth is required.",true);return}
  const dobDate=new Date(dob+"T00:00:00"),today=new Date();today.setHours(0,0,0,0);
  if(Number.isNaN(dobDate.getTime())||dobDate>today){showMsg(regMsg,"Date of birth cannot be in the future.",true);return}
  if(password.length<6){showMsg(regMsg,"Password must be at least 6 characters.",true);return}
  if(!otpVerified){showMsg(regMsg,"Verify your mobile number before creating the account.",true);return}
  const user=auth.currentUser;
  if(!user){showMsg(regMsg,"Mobile verification expired. Please verify the mobile number again.",true);setOtpState(false);return}
  try{
    const applicationNumber=appNo(settings.applicationPrefix),email=`${applicationNumber.toLowerCase()}@candidate.examportal.local`;
    const credential=EmailAuthProvider.credential(email,password);
    const linked=await linkWithCredential(user,credential);
    await setDoc(doc(db,"candidates",linked.user.uid),{applicationNumber,authUid:linked.user.uid,name,dob,mobile,status:"Registered",createdAt:serverTimestamp()});
    await setDoc(doc(db,"applications",applicationNumber),{applicationNumber,authUid:linked.user.uid,candidateId:linked.user.uid,personal:{fullName:name,dob,mobile},status:"Application Incomplete",paymentStatus:"Pending",examId:exam?.id||settings.activeExamId||"default",createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    await signOut(auth);
    showMsg(regMsg,`Registration successful. Your Application Number is ${applicationNumber}. Please sign in to continue.`);
    $("#loginApp").value=applicationNumber;
    openAuthTab("signin");
  }catch(err){
    showMsg(regMsg,err?.message||"Registration failed. Please try again.",true);
  }
};
$("#loginForm").onsubmit=async e=>{e.preventDefault();const n=$("#loginApp").value.trim().toUpperCase();try{await signInWithEmailAndPassword(auth,`${n.toLowerCase()}@candidate.examportal.local`,$("#loginPass").value);const a=await getDoc(doc(db,"applications",n));if(!a.exists()||a.data().authUid!==auth.currentUser?.uid){await signOut(auth);showMsg($("#loginMsg"),"Application not found or access denied.",true);return}sessionStorage.setItem("candidateApp",n);location.href="application-dashboard.html"}catch(e){showMsg($("#loginMsg"),"Login failed. Check Application Number and Password.",true)}};
