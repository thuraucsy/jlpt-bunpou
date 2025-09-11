import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth'
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  onSnapshot 
} from 'firebase/firestore'
import { auth, googleProvider, db } from '../firebase.js'

class AuthService {
  constructor() {
    this.user = null
    this.authStateCallbacks = []
    this.favoritesListenerCallbacks = []
    this.favoritesUnsubscribe = null
  }

  // Initialize auth state listener
  init() {
    return new Promise((resolve) => {
      onAuthStateChanged(auth, (user) => {
        const previousUser = this.user
        this.user = user
        
        // Handle favorites listener lifecycle
        if (user && !previousUser) {
          // User signed in, start favorites listener if there are callbacks
          if (this.favoritesListenerCallbacks.length > 0) {
            this.startFavoritesListener()
          }
        } else if (!user && previousUser) {
          // User signed out, stop favorites listener
          this.stopFavoritesListener()
        }
        
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
          lastSyncAt: createdAt,
          favoritesLastModified: createdAt
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
      const now = new Date()
      
      console.log('Syncing favorites to cloud:', favoritesArray.length, 'items')
      
      await updateDoc(userRef, {
        favorites: favoritesArray,
        lastSyncAt: now,
        favoritesLastModified: now
      })

      // Store local timestamp for comparison
      localStorage.setItem('favoritesLastModified', now.toISOString())

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
        const retryNow = new Date()
        await updateDoc(userRef, {
          favorites: favoritesArray,
          lastSyncAt: retryNow,
          favoritesLastModified: retryNow
        })
        localStorage.setItem('favoritesLastModified', retryNow.toISOString())
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

  // Smart sync favorites using timestamps
  async smartSyncFavorites(localFavorites) {
    if (!this.user) {
      return localFavorites
    }

    try {
      const userRef = doc(db, 'users', this.user.uid)
      const userSnap = await getDoc(userRef)

      if (!userSnap.exists()) {
        console.log('No cloud data found, using local favorites')
        await this.syncFavoritesToCloud(localFavorites)
        return localFavorites
      }

      const userData = userSnap.data()
      const cloudFavorites = new Set(userData.favorites || [])
      const cloudLastModified = userData.favoritesLastModified?.toDate() || new Date(0)
      
      // Get local last modified timestamp
      const localLastModifiedStr = localStorage.getItem('favoritesLastModified')
      const localLastModified = localLastModifiedStr ? new Date(localLastModifiedStr) : new Date(0)

      console.log('Cloud last modified:', cloudLastModified)
      console.log('Local last modified:', localLastModified)
      console.log('Cloud favorites:', cloudFavorites.size, 'items')
      console.log('Local favorites:', localFavorites.size, 'items')

      // If cloud is more recent, use cloud data
      if (cloudLastModified > localLastModified) {
        console.log('Cloud data is more recent, using cloud favorites')
        localStorage.setItem('favoritesLastModified', cloudLastModified.toISOString())
        return cloudFavorites
      }
      // If local is more recent, sync local to cloud
      else if (localLastModified > cloudLastModified) {
        console.log('Local data is more recent, syncing to cloud')
        await this.syncFavoritesToCloud(localFavorites)
        return localFavorites
      }
      // If timestamps are equal, check if data is different
      else {
        const localArray = Array.from(localFavorites).sort()
        const cloudArray = Array.from(cloudFavorites).sort()
        const isDifferent = JSON.stringify(localArray) !== JSON.stringify(cloudArray)
        
        if (isDifferent) {
          console.log('Data differs but timestamps equal, merging and syncing')
          const mergedFavorites = new Set([...localFavorites, ...cloudFavorites])
          await this.syncFavoritesToCloud(mergedFavorites)
          return mergedFavorites
        } else {
          console.log('Data is identical, no sync needed')
          return localFavorites
        }
      }
    } catch (error) {
      console.error('Error in smart sync:', error)
      // Return local favorites if sync fails
      return localFavorites
    }
  }

  // Legacy merge method for backward compatibility
  async mergeFavorites(localFavorites) {
    return this.smartSyncFavorites(localFavorites)
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

  // Subscribe to real-time favorites updates
  onFavoritesChanged(callback) {
    this.favoritesListenerCallbacks.push(callback)
    
    // If user is authenticated, start listening immediately
    if (this.user) {
      this.startFavoritesListener()
    }
    
    // Return unsubscribe function
    return () => {
      const index = this.favoritesListenerCallbacks.indexOf(callback)
      if (index > -1) {
        this.favoritesListenerCallbacks.splice(index, 1)
      }
      
      // If no more callbacks, stop the listener
      if (this.favoritesListenerCallbacks.length === 0) {
        this.stopFavoritesListener()
      }
    }
  }

  // Start listening to favorites changes in Firestore
  startFavoritesListener() {
    if (!this.user || this.favoritesUnsubscribe) {
      return // Already listening or not authenticated
    }

    try {
      const userRef = doc(db, 'users', this.user.uid)
      
      console.log('Starting real-time favorites listener for user:', this.user.uid)
      
      this.favoritesUnsubscribe = onSnapshot(userRef, (doc) => {
        if (doc.exists()) {
          const userData = doc.data()
          const cloudFavorites = new Set(userData.favorites || [])
          const cloudLastModified = userData.favoritesLastModified?.toDate() || new Date(0)
          
          console.log('Real-time favorites update received:', cloudFavorites.size, 'items')
          
          // Update local timestamp
          localStorage.setItem('favoritesLastModified', cloudLastModified.toISOString())
          
          // Notify all callbacks
          this.favoritesListenerCallbacks.forEach(callback => {
            try {
              callback(cloudFavorites, cloudLastModified)
            } catch (error) {
              console.error('Error in favorites listener callback:', error)
            }
          })
        } else {
          console.log('User document does not exist, creating it...')
          this.createUserDocument(this.user).catch(error => {
            console.error('Error creating user document in listener:', error)
          })
        }
      }, (error) => {
        console.error('Error in favorites listener:', error)
        // Retry after a delay
        setTimeout(() => {
          if (this.user && this.favoritesListenerCallbacks.length > 0) {
            console.log('Retrying favorites listener...')
            this.stopFavoritesListener()
            this.startFavoritesListener()
          }
        }, 5000)
      })
    } catch (error) {
      console.error('Error starting favorites listener:', error)
    }
  }

  // Stop listening to favorites changes
  stopFavoritesListener() {
    if (this.favoritesUnsubscribe) {
      console.log('Stopping real-time favorites listener')
      this.favoritesUnsubscribe()
      this.favoritesUnsubscribe = null
    }
  }

  // Update favorites with conflict resolution
  async updateFavorites(favorites, skipListener = false) {
    if (!this.user) {
      throw new Error('User not authenticated')
    }

    try {
      const userRef = doc(db, 'users', this.user.uid)
      const favoritesArray = Array.from(favorites)
      const now = new Date()
      
      console.log('Updating favorites in cloud:', favoritesArray.length, 'items')
      
      // Temporarily stop listener to avoid echo
      const wasListening = !!this.favoritesUnsubscribe
      if (wasListening && !skipListener) {
        this.stopFavoritesListener()
      }
      
      await updateDoc(userRef, {
        favorites: favoritesArray,
        lastSyncAt: now,
        favoritesLastModified: now
      })

      // Store local timestamp
      localStorage.setItem('favoritesLastModified', now.toISOString())

      // Restart listener after a short delay
      if (wasListening && !skipListener) {
        setTimeout(() => {
          if (this.user && this.favoritesListenerCallbacks.length > 0) {
            this.startFavoritesListener()
          }
        }, 500)
      }

      console.log('Favorites updated in cloud successfully')
      return true
    } catch (error) {
      console.error('Error updating favorites in cloud:', error)
      
      // If document doesn't exist, create it first
      if (error.code === 'not-found') {
        console.log('User document not found, creating it...')
        await this.createUserDocument(this.user)
        // Retry the update
        return this.updateFavorites(favorites, skipListener)
      }
      
      throw error
    }
  }
}

// Create and export a singleton instance
export const authService = new AuthService()
export default authService
