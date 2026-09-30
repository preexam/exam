# Production integrations

## Phone OTP
Use Firebase Phone Authentication or an approved SMS OTP provider. The current registration page uses a clearly marked demo OTP so the portal can be tested without a paid SMS provider.

## Payment
Connect Razorpay/other gateway through a trusted backend/Cloud Function. Never put secret keys in frontend JavaScript. On successful webhook verification, write:
payments/{paymentId}
and update:
applications/{applicationNumber}.paymentStatus = "Successful"

## Automatic Admit Card
A trusted backend/Cloud Function should listen for:
applications.status == "Final Submitted"
and paymentStatus == "Successful"
Then create/update:
admitCards/{applicationNumber}
with published=false.

## Offline Result Import
Recommended CSV headers:
Application Number, Roll Number, Candidate Name, Marks Obtained, Maximum Marks, Percentage, Rank, Percentile, Status

The importer should:
1. Validate required columns.
2. Match candidate by Application Number.
3. Preview changes.
4. Confirm import.
5. Write results/{applicationNumber}.
6. Keep published=false until Admin publishes.

## Security
Do not expose service-account credentials in the browser.
Use Firebase Security Rules plus trusted backend functions for privileged actions.
