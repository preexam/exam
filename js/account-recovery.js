const API_BASE=location.hostname==="exam-henna-two.vercel.app"?"":"https://exam-henna-two.vercel.app";

function ensureModal(){
  let modal=document.querySelector("#accountRecoveryModal");
  if(modal)return modal;
  modal=document.createElement("div");
  modal.id="accountRecoveryModal";
  modal.className="account-modal";
  modal.setAttribute("aria-hidden","true");
  modal.innerHTML=`<div class="account-modal-backdrop" data-modal-close></div>
    <div class="account-modal-card" role="dialog" aria-modal="true" aria-labelledby="accountModalTitle">
      <button type="button" class="account-modal-close" aria-label="Close" data-modal-close>×</button>
      <div id="accountModalIcon" class="account-modal-icon">i</div>
      <div id="accountModalContent"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-modal-close]").forEach(x=>x.addEventListener("click",closeModal));
  return modal;
}
function closeModal(){
  const modal=document.querySelector("#accountRecoveryModal");
  if(modal){modal.classList.remove("open");modal.setAttribute("aria-hidden","true");}
}
function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function openModal(html,kind="info"){
  const modal=ensureModal();
  const icon=modal.querySelector("#accountModalIcon");
  icon.className="account-modal-icon "+kind;
  icon.textContent=kind==="success"?"✓":kind==="error"?"!":"i";
  modal.querySelector("#accountModalContent").innerHTML=html;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden","false");
  modal.querySelector("input,button:not(.account-modal-close)")?.focus();
}
export function showRegistrationSuccess(applicationNumber,onContinue){
  openModal(`<span class="eyebrow">REGISTRATION COMPLETE</span>
    <h2 id="accountModalTitle">Successfully Registered</h2>
    <p>Dear Candidate, please save your password securely. You will need this password to access and download your Admit Card and Result in the future.</p>
    <div class="account-number-box"><span>Application Number</span><strong>${escapeHtml(applicationNumber||"")}</strong></div>
    <p class="muted">Your account has been created successfully. Please continue by signing in to complete your application.</p>
    <button type="button" class="btn primary account-modal-action" id="registrationContinue">OK, Continue to Sign In</button>`,"success");
  document.querySelector("#registrationContinue").onclick=()=>{closeModal();onContinue?.()};
}
function recoveryForm(mode){
  const password=mode==="password";
  return `<span class="eyebrow">ACCOUNT RECOVERY</span>
    <h2 id="accountModalTitle">${password?"Reset Password":"Recover Application Number"}</h2>
    <p>${password?"Enter your registered mobile number and date of birth to verify your account. You will then be able to set a new password.":"Enter the mobile number and date of birth used during registration. If the details match, your Application Number will be displayed."}</p>
    <form id="recoveryForm">
      <label>Registered Mobile Number<input id="recoveryMobile" inputmode="numeric" maxlength="10" autocomplete="tel" required></label>
      <label>Date of Birth<input id="recoveryDob" type="date" autocomplete="bday" required></label>
      ${password?'<label>New Password<input id="recoveryPassword" type="password" minlength="8" autocomplete="new-password" required></label><label>Confirm New Password<input id="recoveryPasswordConfirm" type="password" minlength="8" autocomplete="new-password" required></label>':""}
      <p id="recoveryMsg" class="message"></p>
      <button class="btn primary account-modal-action" type="submit">${password?"Set New Password":"Find Application Number"}</button>
    </form>`;
}
async function submitRecovery(mode,form){
  const mobile=form.querySelector("#recoveryMobile").value.trim();
  const dob=form.querySelector("#recoveryDob").value;
  const msg=form.querySelector("#recoveryMsg");
  if(!/^\d{10}$.test(mobile)){msg.textContent="Mobile number must be exactly 10 digits.";msg.className="message danger-text";return}
  if(!dob){msg.textContent="Date of birth is required.";msg.className="message danger-text";return}
  const password=form.querySelector("#recoveryPassword")?.value||"";
  const confirm=form.querySelector("#recoveryPasswordConfirm")?.value||"";
  if(mode==="password"){
    if(password.length<8){msg.textContent="New password must be at least 8 characters.";msg.className="message danger-text";return}
    if(password!==confirm){msg.textContent="New Password and Confirm New Password do not match.";msg.className="message danger-text";return}
  }
  const button=form.querySelector("button[type=submit]");
  button.disabled=true;
  msg.textContent="Verifying your details...";
  try{
    const response=await fetch(API_BASE+"/api/recoverCandidate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode,mobile,dob,newPassword:password})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"We could not verify those details.");
    if(mode==="application"){
      openModal(`<span class="eyebrow">ACCOUNT RECOVERY</span><h2 id="accountModalTitle">Application Number Found</h2>
        <p>Your details have been verified successfully.</p>
        <div class="account-number-box"><span>Application Number</span><strong>${escapeHtml(data.applicationNumber)}</strong></div>
        <p class="muted">Please keep this number safe. You will need it to sign in, access your application, download your Admit Card and view your Result.</p>
        <button type="button" class="btn primary account-modal-action" id="recoveryContinue">Continue to Sign In</button>`,"success");
      document.querySelector("#recoveryContinue").onclick=()=>{
        closeModal();
        const input=document.querySelector("#loginApp,#admitApp,#resultApp");
        if(input)input.value=data.applicationNumber;
      };
    }else{
      openModal(`<span class="eyebrow">PASSWORD UPDATED</span><h2 id="accountModalTitle">Password Reset Successful</h2>
        <p>Your password has been updated successfully.</p>
        <p class="muted">You can now sign in using your Application Number and new password.</p>
        <button type="button" class="btn primary account-modal-action" id="recoveryContinue">OK, Continue to Sign In</button>`,"success");
      document.querySelector("#recoveryContinue").onclick=()=>{
        closeModal();
        const appInput=document.querySelector("#loginApp,#admitApp,#resultApp");
        const passInput=document.querySelector("#loginPass,#admitPass,#resultPass");
        if(appInput)appInput.value=data.applicationNumber;
        if(passInput){passInput.value="";passInput.focus();}
      };
    }
  }catch(err){
    msg.textContent=err.message||"We could not verify those details.";
    msg.className="message danger-text";
    button.disabled=false;
  }
}
export function setupRecoveryLinks(){
  document.querySelectorAll("[data-recovery]").forEach(link=>{
    link.addEventListener("click",()=>{
      const mode=link.dataset.recovery==="password"?"password":"application";
      openModal(recoveryForm(mode));
      const form=document.querySelector("#recoveryForm");
      form.onsubmit=e=>{e.preventDefault();submitRecovery(mode,form)};
    });
  });
}
