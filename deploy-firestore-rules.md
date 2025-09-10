# Deploy Firestore Rules

## Steps to set up Firestore and deploy rules:

### 1. Create Firestore Database
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: `jlpt-bunpou-36535`
3. Click "Firestore Database" in the left sidebar
4. Click "Create database"
5. Choose "Start in test mode" (for development)
6. Select location: `asia-northeast1` (or closest to your users)
7. Use default database ID: `(default)`

### 2. Deploy Security Rules (Optional - for production)
If you want to use the custom security rules from `firestore.rules`:

1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Initialize: `firebase init firestore`
4. Deploy rules: `firebase deploy --only firestore:rules`

### 3. Test the Implementation
After creating the Firestore database:
1. Sign in to your app with Google
2. Add some favorites
3. Check browser console for sync messages
4. Sign out and sign back in to verify favorites persist

### 4. Troubleshooting
If sync still fails, check:
- Browser console for error messages
- Firebase Console > Firestore > Data to see if user documents are created
- Firebase Console > Authentication to verify user is signed in
- Network tab in browser dev tools for failed requests
