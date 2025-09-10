import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth'
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc 
} from 'firebase/firestore'
import { auth, googleProvider, db } from '../firebase.js'

class AuthService {
  constructor() {
    this.user = null
    this.authStateCallbacks = []
  }

  // Initialize auth state listener
  init() {
    return new Promise((resolve) => {
      onAuthStateChanged(auth, (user) => {
        this.user = user
        this.authStateCallbacks.forEach(callback => callback(user))
        resolve(user)
      })
    })
  }

  // Subscribe to auth state changes
  onAuthStateChanged(callback) {
    this.authStateCallbacks.push(callback)
    // Call immediately with current state
    callback(this.user)
    
    // Return unsubscribe function
    return () => {
      const index = this.authStateCallbacks.indexOf(callback)
      if (index > -1) {
        this.authStateCallbacks.splice(index, 1)
      }
    }
  }

  // Sign in with Google
  async signInWithGoogle() {
    try {
      const result = await signInWithPopup(auth, googleProvider)
      const user = result.user
      
      // Create or update user document in Firestore
      await this.createUserDocument(user)
      
      return user
    } catch (error) {
      console.error('Error signing in with Google:', error)
      throw error
    }
  }

  // Sign out
  async signOut() {
    try {
      await signOut(auth)
    } catch (error) {
      console.error('Error signing out:', error)
      throw error
    }
  }

  // Create user document in Firestore
  async createUserDocument(user) {
    if (!user) return

    const userRef = doc(db, 'users', user.uid)
    const userSnap = await getDoc(userRef)

    if (!userSnap.exists()) {
      const { displayName, email, photoURL } = user
      const createdAt = new Date()

      try {
        await setDoc(userRef, {
          displayName,
          email,
          photoURL,
          createdAt,
          favorites: [],
          lastSyncAt: createdAt
        })
      } catch (error) {
        console.error('Error creating user document:', error)
        throw error
      }
    }
  }

  // Get current user
  getCurrentUser() {
    return this.user
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.user
  }

  // Sync favorites to Firestore
  async syncFavoritesToCloud(favorites) {
    if (!this.user) {
      throw new Error('User not authenticated')
    }

    try {
      const userRef = doc(db, 'users', this.user.uid)
      const favoritesArray = Array.from(favorites)
      
      console.log('Syncing favorites to cloud:', favoritesArray.length, 'items')
      
      await updateDoc(userRef, {
        favorites: favoritesArray,
        lastSyncAt: new Date()
      })

      console.log('Favorites synced to cloud successfully')
      return true
    } catch (error) {
      console.error('Error syncing favorites to cloud:', error)
      console.error('Error details:', error.code, error.message)
      
      // If document doesn't exist, create it first
      if (error.code === 'not-found') {
        console.log('User document not found, creating it...')
        await this.createUserDocument(this.user)
        // Retry the sync
        await updateDoc(userRef, {
          favorites: favoritesArray,
          lastSyncAt: new Date()
        })
        console.log('Favorites synced after creating user document')
        return true
      }
      
      throw error
    }
  }

  // Get favorites from Firestore
  async getFavoritesFromCloud() {
    if (!this.user) {
      throw new Error('User not authenticated')
    }

    try {
      const userRef = doc(db, 'users', this.user.uid)
      const userSnap = await getDoc(userRef)

      if (userSnap.exists()) {
        const userData = userSnap.data()
        const cloudFavorites = userData.favorites || []
        console.log('Retrieved favorites from cloud:', cloudFavorites.length, 'items')
        return new Set(cloudFavorites)
      } else {
        console.log('User document does not exist in cloud')
        return new Set()
      }
    } catch (error) {
      console.error('Error getting favorites from cloud:', error)
      console.error('Error details:', error.code, error.message)
      throw error
    }
  }

  // Merge local and cloud favorites
  async mergeFavorites(localFavorites) {
    if (!this.user) {
      return localFavorites
    }

    try {
      const cloudFavorites = await this.getFavoritesFromCloud()
      
      // Merge local and cloud favorites
      const mergedFavorites = new Set([...localFavorites, ...cloudFavorites])
      
      // Sync the merged favorites back to cloud
      await this.syncFavoritesToCloud(mergedFavorites)
      
      return mergedFavorites
    } catch (error) {
      console.error('Error merging favorites:', error)
      // Return local favorites if cloud sync fails
      return localFavorites
    }
  }

  // Get user profile data
  async getUserProfile() {
    if (!this.user) {
      return null
    }

    try {
      const userRef = doc(db, 'users', this.user.uid)
      const userSnap = await getDoc(userRef)

      if (userSnap.exists()) {
        return userSnap.data()
      } else {
        return null
      }
    } catch (error) {
      console.error('Error getting user profile:', error)
      return null
    }
  }
}

// Create and export a singleton instance
export const authService = new AuthService()
export default authService
