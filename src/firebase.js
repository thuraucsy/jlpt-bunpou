import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Firebase configuration
// You'll need to replace these with your actual Firebase project credentials
const firebaseConfig = {
  apiKey: "AIzaSyDO0PJoqD50YmqG7iewQAmv3FmmPeRlhl8",
  authDomain: "jlpt-bunpou-36535.firebaseapp.com",
  projectId: "jlpt-bunpou-36535",
  storageBucket: "jlpt-bunpou-36535.firebasestorage.app",
  messagingSenderId: "490169162603",
  appId: "1:490169162603:web:fb487d1adaf755a5ea4a2e",
  measurementId: "G-6EMDLJRV93"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app)

// Initialize Google Auth Provider
export const googleProvider = new GoogleAuthProvider()

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app)

export default app
