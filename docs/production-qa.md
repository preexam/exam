 # Production QA Checklist

## Candidate
- Registration validation: mobile, DOB, password, application ID.
- Login ownership check.
- Application save / final submit.
- Correction window.
- Dynamic custom fields: required, regex, date, number, multi-select, locked values.
- Dynamic document upload: size/type and existing-file display.
- Admit card authentication and release date.
- Result authentication and release date.
- Online exam: eligibility, one attempt, server-created paper, timer, autosave, submit, server grading.

## Admin
- Role/permission isolation.
- Session timeout.
- Application status transitions.
- Exam lifecycle dates.
- Centre capacity and roll allocation.
- Automatic admit draft + centre assignment.
- Result validation/import/publish.
- Audit log search/export.
- Reports CSV export.

## Security
- Firestore Rules emulator tests.
- Storage Rules emulator tests.
- Candidate cannot read another candidate's application/admit/result.
- Candidate cannot read online answer keys.
- Candidate cannot change online score/grade fields.
- Storage upload is owner/admin only and MIME/size constrained.
- Service account credentials are never committed.

## CI / deployment
- `npm run test:rules`
- `npm run test:ui:firebase`
- Manual Firebase deployment workflow after configuring the `FIREBASE_SERVICE_ACCOUNT` GitHub secret.
- Live smoke test after deployment.
- OTP and payment remain intentionally excluded from this hardening pass.
