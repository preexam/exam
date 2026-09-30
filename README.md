# Government Exam Portal – Full Starter System

This project contains the complete frontend structure for:
- Application / Registration
- Candidate Login
- Configurable Application Form
- Documents
- Payment status handling
- Final submission
- Application PDF print/download
- Admit Card
- Automatic admit-card draft generation
- Configurable roll numbers
- Exam centre management
- Result
- Online / Offline / Hybrid exam modes
- Excel/CSV-style result import
- Individual candidate result
- Result PDF print/download
- Admin dashboard
- Exam configuration
- Form builder
- Document builder
- Admit-card management
- Result management
- Notices
- Reports
- Admin roles / audit log UI
- Firestore security rules

## Important
This is a Firebase-ready application foundation. Real OTP and real payment processing require connecting an OTP provider and payment gateway. The UI and data-flow are prepared so those services can be integrated without changing the overall portal architecture.

## Setup
1. Create a Firebase project.
2. Enable Authentication (Email/Password for the starter; phone OTP can be connected to Firebase Phone Auth).
3. Enable Firestore.
4. Copy `firebase-config.example.js` to `firebase-config.js` and enter your Firebase web configuration.
5. Deploy the files using Firebase Hosting, GitHub Pages with appropriate build setup, or another static host.
6. Apply `firestore.rules`.
7. Create the first admin user in Firebase Authentication and add an `admins/{uid}` document with:
   `{ "role": "superadmin", "active": true, "name": "Super Admin" }`

## Routes
- `index.html` – portal home
- `application.html` – candidate application
- `admit-card.html` – admit card
- `result.html` – result
- `admin.html` – admin panel

The project intentionally uses plain HTML/CSS/ES modules so it can be uploaded to a normal GitHub repository without a build step.
