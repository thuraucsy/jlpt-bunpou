<template>
  <div class="user-auth">
    <!-- Loading State -->
    <div v-if="authLoading" class="auth-loading">
      <div class="spinner-small"></div>
    </div>

    <!-- Signed Out State -->
    <div v-else-if="!user" class="signed-out">
      <button @click="signIn" class="sign-in-btn" :disabled="signingIn">
        <span v-if="signingIn" class="spinner-small"></span>
        <span v-else class="google-icon">🔐</span>
        {{ signingIn ? 'Signing in...' : 'Sign in with Google' }}
      </button>
      <p class="auth-description">Sign in to sync your favorites across devices</p>
    </div>

    <!-- Signed In State -->
    <div v-else class="signed-in">
      <div class="user-info">
        <img 
          v-if="user.photoURL" 
          :src="user.photoURL" 
          :alt="user.displayName"
          class="user-avatar"
        >
        <div class="user-details">
          <span class="user-name">{{ user.displayName || 'User' }}</span>
          <span class="sync-status" :class="syncStatusClass">
            {{ syncStatusText }}
          </span>
        </div>
      </div>
      <div class="user-actions">
        <button @click="syncNow" class="sync-btn" :disabled="syncing" title="Sync favorites now">
          <span v-if="syncing" class="spinner-small"></span>
          <span v-else>🔄</span>
        </button>
        <button @click="signOut" class="sign-out-btn" :disabled="signingOut" title="Sign out">
          <span v-if="signingOut" class="spinner-small"></span>
          <span v-else>🚪</span>
        </button>
      </div>
    </div>

    <!-- Error Message -->
    <div v-if="error" class="auth-error" @click="clearError">
      <span class="error-icon">⚠️</span>
      <span class="error-message">{{ error }}</span>
      <button class="error-close">✕</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import authService from '../services/authService.js'

// Props
const props = defineProps({
  favorites: {
    type: Set,
    required: true
  }
})

// Emits
const emit = defineEmits(['favoritesUpdated', 'authStateChanged'])

// Reactive data
const user = ref(null)
const authLoading = ref(true)
const signingIn = ref(false)
const signingOut = ref(false)
const syncing = ref(false)
const error = ref(null)
const lastSyncTime = ref(null)

// Auth state unsubscribe function
let unsubscribeAuth = null

// Computed properties
const syncStatusClass = computed(() => {
  if (syncing.value) return 'syncing'
  if (lastSyncTime.value) return 'synced'
  return 'not-synced'
})

const syncStatusText = computed(() => {
  if (syncing.value) return 'Syncing...'
  if (lastSyncTime.value) {
    const now = new Date()
    const diff = now - lastSyncTime.value
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'Just synced'
    if (minutes < 60) return `Synced ${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `Synced ${hours}h ago`
    return 'Synced recently'
  }
  return 'Not synced'
})

// Methods
const signIn = async () => {
  if (signingIn.value) return
  
  signingIn.value = true
  error.value = null
  
  try {
    const signedInUser = await authService.signInWithGoogle()
    
    // Merge local favorites with cloud favorites
    const mergedFavorites = await authService.mergeFavorites(props.favorites)
    emit('favoritesUpdated', mergedFavorites)
    
    lastSyncTime.value = new Date()
    console.log('Successfully signed in and synced favorites')
  } catch (err) {
    console.error('Sign in error:', err)
    if (err.code === 'auth/popup-closed-by-user') {
      error.value = 'Sign-in was cancelled'
    } else if (err.code === 'auth/popup-blocked') {
      error.value = 'Pop-up was blocked. Please allow pop-ups and try again.'
    } else {
      error.value = 'Failed to sign in. Please try again.'
    }
  } finally {
    signingIn.value = false
  }
}

const signOut = async () => {
  if (signingOut.value) return
  
  signingOut.value = true
  error.value = null
  
  try {
    await authService.signOut()
    lastSyncTime.value = null
    console.log('Successfully signed out')
  } catch (err) {
    console.error('Sign out error:', err)
    error.value = 'Failed to sign out. Please try again.'
  } finally {
    signingOut.value = false
  }
}

const syncNow = async () => {
  if (syncing.value || !user.value) return
  
  syncing.value = true
  error.value = null
  
  try {
    // First, read from Firestore and merge with local favorites
    console.log('Reading favorites from cloud...')
    const mergedFavorites = await authService.mergeFavorites(props.favorites)
    
    // Update local favorites with merged data
    emit('favoritesUpdated', mergedFavorites)
    
    lastSyncTime.value = new Date()
    console.log('Manual sync completed - favorites merged from cloud')
  } catch (err) {
    console.error('Sync error:', err)
    error.value = 'Failed to sync favorites. Please try again.'
  } finally {
    syncing.value = false
  }
}

const clearError = () => {
  error.value = null
}

// Auto-sync favorites when they change (debounced)
let syncTimeout = null
const autoSync = async () => {
  if (!user.value || syncing.value) return
  
  // Clear existing timeout
  if (syncTimeout) {
    clearTimeout(syncTimeout)
  }
  
  // Debounce sync by 2 seconds
  syncTimeout = setTimeout(async () => {
    try {
      syncing.value = true
      await authService.syncFavoritesToCloud(props.favorites)
      lastSyncTime.value = new Date()
      console.log('Auto-sync completed')
    } catch (err) {
      console.error('Auto-sync error:', err)
      // Don't show error for auto-sync failures to avoid spam
    } finally {
      syncing.value = false
    }
  }, 2000)
}

// Watch for favorites changes and auto-sync
const watchFavorites = () => {
  if (user.value) {
    autoSync()
  }
}

// Lifecycle
onMounted(async () => {
  try {
    // Initialize auth service
    await authService.init()
    
    // Subscribe to auth state changes
    unsubscribeAuth = authService.onAuthStateChanged((newUser) => {
      user.value = newUser
      authLoading.value = false
      emit('authStateChanged', newUser)
      
      if (newUser) {
        // User signed in, merge favorites
        authService.mergeFavorites(props.favorites).then((mergedFavorites) => {
          emit('favoritesUpdated', mergedFavorites)
          lastSyncTime.value = new Date()
        }).catch((err) => {
          console.error('Error merging favorites on auth state change:', err)
        })
      }
    })
  } catch (err) {
    console.error('Error initializing auth:', err)
    authLoading.value = false
    error.value = 'Failed to initialize authentication'
  }
})

onUnmounted(() => {
  if (unsubscribeAuth) {
    unsubscribeAuth()
  }
  if (syncTimeout) {
    clearTimeout(syncTimeout)
  }
})

// Expose methods for parent component
defineExpose({
  syncNow,
  watchFavorites
})
</script>

<style scoped>
.user-auth {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.auth-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Signed Out State */
.signed-out {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
}

.sign-in-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #4285f4, #34a853);
  color: white;
  border: none;
  border-radius: 25px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 3px 12px rgba(66, 133, 244, 0.3);
  white-space: nowrap;
}

.sign-in-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 16px rgba(66, 133, 244, 0.4);
  background: linear-gradient(135deg, #34a853, #4285f4);
}

.sign-in-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.google-icon {
  font-size: 1.1rem;
}

.auth-description {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.8rem;
  margin: 0;
  line-height: 1.4;
}

/* Signed In State */
.signed-in {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.user-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  flex-shrink: 0;
}

.user-details {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  flex: 1;
}

.user-name {
  color: white;
  font-weight: 600;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sync-status {
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sync-status.syncing {
  color: #ffc107;
  animation: pulse 1.5s ease-in-out infinite;
}

.sync-status.synced {
  color: #28a745;
}

.sync-status.not-synced {
  color: rgba(255, 255, 255, 0.6);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.user-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.sync-btn, .sign-out-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.9rem;
  flex-shrink: 0;
}

.sync-btn {
  background: linear-gradient(135deg, #28a745, #20c997);
  color: white;
  box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
}

.sync-btn:hover:not(:disabled) {
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 4px 12px rgba(40, 167, 69, 0.4);
}

.sign-out-btn {
  background: linear-gradient(135deg, #dc3545, #c82333);
  color: white;
  box-shadow: 0 2px 8px rgba(220, 53, 69, 0.3);
}

.sign-out-btn:hover:not(:disabled) {
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 4px 12px rgba(220, 53, 69, 0.4);
}

.sync-btn:disabled, .sign-out-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

/* Error Message */
.auth-error {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: linear-gradient(135deg, #dc3545, #c82333);
  color: white;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.3s ease;
  width: 100%;
  box-sizing: border-box;
  animation: slideIn 0.3s ease-out;
}

.auth-error:hover {
  background: linear-gradient(135deg, #c82333, #dc3545);
}

.error-icon {
  flex-shrink: 0;
}

.error-message {
  flex: 1;
  line-height: 1.4;
}

.error-close {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  font-size: 1rem;
  padding: 0;
  flex-shrink: 0;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Dark Mode Styles */
.app.dark-mode .user-auth {
  background: rgba(40, 40, 40, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
}

.app.dark-mode .auth-description {
  color: rgba(255, 255, 255, 0.7);
}

.app.dark-mode .user-name {
  color: #e8e8e8;
}

.app.dark-mode .sync-status.synced {
  color: #4caf50;
}

.app.dark-mode .sync-status.not-synced {
  color: rgba(255, 255, 255, 0.5);
}

.app.dark-mode .user-avatar {
  border: 2px solid rgba(255, 255, 255, 0.2);
}

/* Responsive Design */
@media (max-width: 768px) {
  .user-auth {
    padding: 0.75rem;
    gap: 0.5rem;
  }
  
  .signed-in {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }
  
  .user-info {
    justify-content: center;
  }
  
  .user-actions {
    justify-content: center;
  }
  
  .sign-in-btn {
    padding: 0.6rem 1.2rem;
    font-size: 0.85rem;
  }
  
  .auth-description {
    font-size: 0.75rem;
  }
}

@media (max-width: 480px) {
  .user-auth {
    padding: 0.5rem;
  }
  
  .user-info {
    gap: 0.5rem;
  }
  
  .user-avatar {
    width: 32px;
    height: 32px;
  }
  
  .user-name {
    font-size: 0.85rem;
  }
  
  .sync-status {
    font-size: 0.7rem;
  }
  
  .sync-btn, .sign-out-btn {
    width: 32px;
    height: 32px;
    font-size: 0.8rem;
  }
  
  .sign-in-btn {
    padding: 0.5rem 1rem;
    font-size: 0.8rem;
  }
  
  .auth-error {
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
  }
}
</style>
