<script setup>
import { ref, computed, onMounted, watch } from 'vue'

// Reactive data
const grammarData = ref([])
const searchTerm = ref('')
const selectedLevel = ref('3') // Default to N3 level for better performance
const loading = ref(true)
const filterLoading = ref(false) // Loading state for level changes
const error = ref(null)
const showBackToTop = ref(false) // Show back to top button
const isFlashcardMode = ref(false) // Toggle flashcard mode
const currentCardIndex = ref(0) // Current flashcard index
const modeLoading = ref(false) // Loading state for mode transitions

// Touch/swipe handling for mobile flashcards
const touchStartX = ref(0)
const touchStartY = ref(0)
const isSwipeAnimating = ref(false)

// Favorites functionality
const favorites = ref(new Set())

// Dark mode functionality
const isDarkMode = ref(false)
const isSystemDarkMode = ref(false)

// System dark mode detection
const detectSystemDarkMode = () => {
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    isSystemDarkMode.value = mediaQuery.matches
    return mediaQuery.matches
  }
  return false
}

// Dark mode functions - OS dependent only
const initializeSystemDarkMode = () => {
  // Always use system preference
  isDarkMode.value = detectSystemDarkMode()
}

// Listen for system dark mode changes
const setupSystemDarkModeListener = () => {
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    
    const handleSystemDarkModeChange = (e) => {
      isSystemDarkMode.value = e.matches
      // Always follow system preference
      isDarkMode.value = e.matches
    }
    
    mediaQuery.addEventListener('change', handleSystemDarkModeChange)
    
    // Return cleanup function
    return () => {
      mediaQuery.removeEventListener('change', handleSystemDarkModeChange)
    }
  }
  return () => {}
}

// Load grammar data with offline support
const loadGrammarData = async () => {
  try {
    loading.value = true
    error.value = null
    
    // Try to load from cache first (localStorage backup)
    const cachedData = localStorage.getItem('jlpt-grammar-data')
    const cacheTimestamp = localStorage.getItem('jlpt-grammar-data-timestamp')
    
    // If we have cached data, use it immediately while trying to fetch fresh data
    if (cachedData) {
      try {
        const parsedCachedData = JSON.parse(cachedData)
        grammarData.value = parsedCachedData.sort((a, b) => a.n_level - b.n_level || a.no - b.no)
        loading.value = false
        console.log('Loaded grammar data from cache')
      } catch (cacheError) {
        console.warn('Failed to parse cached data:', cacheError)
      }
    }
    
    // Try to fetch fresh data from network
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
      
      const response = await fetch('/jlpt_bunpou_data.json', {
        signal: controller.signal,
        cache: 'no-cache' // Always try to get fresh data
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      
      // Update data and cache
      grammarData.value = data.sort((a, b) => a.n_level - b.n_level || a.no - b.no)
      
      // Cache the fresh data
      localStorage.setItem('jlpt-grammar-data', JSON.stringify(data))
      localStorage.setItem('jlpt-grammar-data-timestamp', Date.now().toString())
      
      loading.value = false
      console.log('Loaded fresh grammar data from network')
      
    } catch (networkError) {
      console.warn('Network fetch failed:', networkError.message)
      
      // If we already have cached data, we're good
      if (cachedData && grammarData.value.length > 0) {
        loading.value = false
        console.log('Using cached data due to network failure')
        return
      }
      
      // Try to get data from service worker cache as last resort
      try {
        if ('caches' in window) {
          const cache = await caches.open('workbox-precache-v2-/jlpt-bunpou/')
          const cachedResponse = await cache.match('/jlpt_bunpou_data.json')
          
          if (cachedResponse) {
            const data = await cachedResponse.json()
            grammarData.value = data.sort((a, b) => a.n_level - b.n_level || a.no - b.no)
            loading.value = false
            console.log('Loaded grammar data from service worker cache')
            return
          }
        }
      } catch (swCacheError) {
        console.warn('Service worker cache access failed:', swCacheError)
      }
      
      // If all else fails, show error
      throw new Error('Unable to load grammar data. Please check your internet connection and try again.')
    }
    
  } catch (err) {
    console.error('Failed to load grammar data:', err)
    error.value = err.message
    loading.value = false
  }
}

// Computed filtered data
const filteredGrammar = computed(() => {
  let filtered = grammarData.value

  // Filter by JLPT level or favorites
  if (selectedLevel.value === 'favorites') {
    // Show only favorites, ordered by when they were added (most recent first)
    filtered = filtered.filter(item => favorites.value.has(item.no))
    
    // Sort by favorites order (most recently added first)
    try {
      const savedFavorites = localStorage.getItem('jlpt-favorites')
      if (savedFavorites) {
        const favArray = JSON.parse(savedFavorites)
        // Create a map of grammar number to its position in favorites array (reversed for desc order)
        const favOrderMap = new Map()
        favArray.forEach((grammarNo, index) => {
          favOrderMap.set(grammarNo, favArray.length - index) // Higher number = more recent
        })
        
        // Sort filtered items by their position in favorites array
        filtered.sort((a, b) => {
          const orderA = favOrderMap.get(a.no) || 0
          const orderB = favOrderMap.get(b.no) || 0
          return orderA - orderB // Ascending order (most recent first)
        })
      }
    } catch (error) {
      console.error('Error sorting favorites:', error)
    }
  } else if (selectedLevel.value !== 'all') {
    // Filter by specific JLPT level
    filtered = filtered.filter(item => item.n_level === parseInt(selectedLevel.value))
  }

  // Filter by search term
  if (searchTerm.value.trim()) {
    const term = searchTerm.value.toLowerCase().trim()
    filtered = filtered.filter(item => 
      item.kanji.toLowerCase().includes(term) ||
      item.kana.toLowerCase().includes(term) ||
      item.meaning_mm.toLowerCase().includes(term) ||
      item.where_to_use.toLowerCase().includes(term) ||
      item.tmp_example.toLowerCase().includes(term)
    )
  }

  return filtered
})

// Get unique JLPT levels for filter dropdown with counts
const jlptLevels = computed(() => {
  const levels = [...new Set(grammarData.value.map(item => item.n_level))].sort()
  return levels
})

// Get count of grammar points for each level
const getLevelCount = (level) => {
  return grammarData.value.filter(item => item.n_level === level).length
}

// Get total count of all grammar points
const getTotalCount = () => {
  return grammarData.value.length
}

// Get total count of favorite grammar points
const getTotalFavoriteCount = () => {
  return favorites.value.size
}

// Favorites functionality
const toggleFavorite = (grammarNo) => {
  if (favorites.value.has(grammarNo)) {
    favorites.value.delete(grammarNo)
  } else {
    favorites.value.add(grammarNo)
  }
  saveFavorites()
}

const isFavorite = (grammarNo) => {
  return favorites.value.has(grammarNo)
}

// Load favorites from localStorage
const loadFavorites = () => {
  try {
    const savedFavorites = localStorage.getItem('jlpt-favorites')
    if (savedFavorites) {
      const favArray = JSON.parse(savedFavorites)
      favorites.value = new Set(favArray)
    }
  } catch (error) {
    console.error('Error loading favorites:', error)
    favorites.value = new Set()
  }
}

// Save favorites to localStorage
const saveFavorites = () => {
  try {
    const favArray = Array.from(favorites.value)
    localStorage.setItem('jlpt-favorites', JSON.stringify(favArray))
  } catch (error) {
    console.error('Error saving favorites:', error)
  }
}


// Get level color class
const getLevelColor = (level) => {
  const colors = {
    1: 'level-1',
    2: 'level-2', 
    3: 'level-3',
    4: 'level-4',
    5: 'level-5'
  }
  return colors[level] || 'level-default'
}

// Clear search
const clearSearch = () => {
  searchTerm.value = ''
}

// Convert kanji(hiragana) format to ruby text (furigana)
const convertToRuby = (text) => {
  if (!text) return text
  
  // Regex to match kanji(hiragana) pattern
  // [一-龯々] matches kanji characters including 々 (repetition mark)
  // [ぁ-ゟ] matches hiragana characters
  const kanjiHiraganaPattern = /([一-龯々]+)\(([ぁ-ゟ]+)\)/g
  
  return text.replace(kanjiHiraganaPattern, '<ruby>$1<rt>$2</rt></ruby>')
}

// Parse examples to separate multiple examples and JP/MM parts
const parseExamples = (exampleText) => {
  if (!exampleText) return []
  
  // Split by Myanmar end character "။"
  const examples = exampleText.split('။').filter(example => example.trim())
  
  return examples.map(example => {
    const trimmedExample = example.trim()
    // Split by Japanese period "。" to separate JP and MM
    const parts = trimmedExample.split('。')
    
    if (parts.length >= 2) {
      return {
        japanese: convertToRuby(parts[0].trim() + '。'), // Add back the Japanese period and convert to ruby
        myanmar: parts.slice(1).join('。').trim() // Join remaining parts as Myanmar
      }
    } else {
      // If no Japanese period found, treat the whole thing as one example
      return {
        japanese: convertToRuby(trimmedExample),
        myanmar: ''
      }
    }
  })
}

// Load saved level preference from localStorage
const loadSavedLevel = () => {
  const savedLevel = localStorage.getItem('jlpt-selected-level')
  if (savedLevel) {
    selectedLevel.value = savedLevel
  }
}

// Save level preference to localStorage
const saveLevelPreference = (level) => {
  localStorage.setItem('jlpt-selected-level', level)
}

// Handle scroll events for back to top button
const handleScroll = () => {
  showBackToTop.value = window.scrollY > 500 // Show after scrolling 500px
}

// Scroll to top function
const scrollToTop = () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  })
}

// Flashcard navigation functions
const toggleFlashcardMode = async () => {
  modeLoading.value = true
  // Add a small delay to show loading state
  await new Promise(resolve => setTimeout(resolve, 400))
  isFlashcardMode.value = !isFlashcardMode.value
  currentCardIndex.value = 0 // Reset to first card when toggling
  modeLoading.value = false
}

const nextCard = () => {
  if (currentCardIndex.value < filteredGrammar.value.length - 1) {
    currentCardIndex.value++
  }
}

const prevCard = () => {
  if (currentCardIndex.value > 0) {
    currentCardIndex.value--
  }
}

const goToCard = (index) => {
  if (index >= 0 && index < filteredGrammar.value.length) {
    currentCardIndex.value = index
  }
}

// Current card for flashcard mode
const currentCard = computed(() => {
  return filteredGrammar.value[currentCardIndex.value] || null
})

// Get stacked cards (next 3 cards behind current card)
const getStackedCards = () => {
  const stackSize = 3
  const cards = []
  
  for (let i = 1; i <= stackSize; i++) {
    const nextIndex = currentCardIndex.value + i
    if (nextIndex < filteredGrammar.value.length) {
      cards.push(filteredGrammar.value[nextIndex])
    }
  }
  
  return cards
}

// Get styling for stacked cards with decreasing overlap
const getStackedCardStyle = (index) => {
  // Check if we're on mobile (screen width < 768px)
  const isMobile = window.innerWidth < 768
  const isExtraSmall = window.innerWidth < 480
  
  // Adjust values based on screen size
  const baseOffset = isExtraSmall ? 4 : isMobile ? 6 : 8 // Smaller offset on mobile
  const scaleReduction = isExtraSmall ? 0.015 : isMobile ? 0.018 : 0.02 // Less scale reduction on mobile
  const opacityReduction = 0.15 // Keep opacity reduction consistent
  const rotationVariation = isExtraSmall ? 1 : isMobile ? 1.5 : 2 // Less rotation on mobile
  
  const offset = baseOffset * (index + 1)
  const scale = 1 - (scaleReduction * (index + 1))
  const opacity = 1 - (opacityReduction * (index + 1))
  const rotation = (index % 2 === 0 ? 1 : -1) * rotationVariation * (index + 1)
  
  // Reduce horizontal translation on mobile to prevent overflow
  const horizontalOffset = isMobile ? offset / 4 : offset / 2
  
  return {
    transform: `translateY(${offset}px) translateX(${horizontalOffset}px) scale(${scale}) rotate(${rotation}deg)`,
    opacity: opacity,
    zIndex: 10 - (index + 1)
  }
}

// Touch/swipe event handlers for mobile flashcards
const handleTouchStart = (event) => {
  if (!isFlashcardMode.value || isSwipeAnimating.value) return
  
  const touch = event.touches[0]
  touchStartX.value = touch.clientX
  touchStartY.value = touch.clientY
}

const handleTouchEnd = (event) => {
  if (!isFlashcardMode.value || isSwipeAnimating.value) return
  
  const touch = event.changedTouches[0]
  const deltaX = touch.clientX - touchStartX.value
  const deltaY = touch.clientY - touchStartY.value
  
  // Check if it's a horizontal swipe (more horizontal than vertical)
  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
    isSwipeAnimating.value = true
    
    if (deltaX > 0) {
      // Swipe right - go to previous card
      prevCard()
    } else {
      // Swipe left - go to next card
      nextCard()
    }
    
    // Reset animation flag after a short delay
    setTimeout(() => {
      isSwipeAnimating.value = false
    }, 300)
  }
}

// Audio playback functionality
const currentAudio = ref(null)
const audioError = ref(null)
const showAudioError = ref(false)

const playExampleAudio = (grammarNo, exampleIndex) => {
  try {
    // Stop any currently playing audio
    if (currentAudio.value) {
      currentAudio.value.pause()
      currentAudio.value.currentTime = 0
    }
    
    // Generate the correct audio file path
    const audioPath = `/voices/example-${grammarNo}/${exampleIndex + 1}.mp3`
    
    // Create and play new audio
    const audio = new Audio(audioPath)
    currentAudio.value = audio
    
    // Clean up reference when audio ends or errors
    audio.addEventListener('ended', () => {
      currentAudio.value = null
    })
    
    audio.addEventListener('error', (error) => {
      console.warn(`Audio playback failed for ${audioPath}:`, error)
      currentAudio.value = null
      showAudioErrorMessage('Audio file not available. This feature requires an internet connection or pre-downloaded audio files.')
    })
    
    audio.play().catch(error => {
      console.warn(`Audio playback failed for ${audioPath}:`, error)
      currentAudio.value = null
      showAudioErrorMessage('Audio playback failed. Please check your internet connection or try again later.')
    })
  } catch (error) {
    console.warn('Audio creation failed:', error)
    currentAudio.value = null
    showAudioErrorMessage('Audio feature is not available. Please check your browser settings or internet connection.')
  }
}

const showAudioErrorMessage = (message) => {
  audioError.value = message
  showAudioError.value = true
  
  // Auto-hide error after 3 seconds
  setTimeout(() => {
    showAudioError.value = false
    audioError.value = null
  }, 3000)
}

const hideAudioError = () => {
  showAudioError.value = false
  audioError.value = null
}

// Keyboard navigation for flashcard mode
const handleKeydown = (event) => {
  if (!isFlashcardMode.value) return
  
  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault()
      prevCard()
      break
    case 'ArrowRight':
      event.preventDefault()
      nextCard()
      break
    case 'Escape':
      event.preventDefault()
      toggleFlashcardMode()
      break
  }
}

// Watch for level changes and save to localStorage
watch(selectedLevel, async (newLevel) => {
  saveLevelPreference(newLevel)
  
  // Reset card index when changing levels
  currentCardIndex.value = 0
  
  // Show loading when level changes (except during initial load)
  if (!loading.value) {
    filterLoading.value = true
    // Add a small delay to show loading state
    await new Promise(resolve => setTimeout(resolve, 300))
    filterLoading.value = false
  }
})

// Load data on component mount
onMounted(() => {
  loadSavedLevel() // Load saved level preference first
  loadFavorites() // Load saved favorites
  initializeSystemDarkMode() // Initialize system dark mode
  loadGrammarData()
  
  // Set up system dark mode listener
  const cleanupSystemListener = setupSystemDarkModeListener()
  
  // Add scroll event listener
  window.addEventListener('scroll', handleScroll)
  // Add keyboard event listener
  window.addEventListener('keydown', handleKeydown)
  
  // Store cleanup function for unmount
  window._darkModeCleanup = cleanupSystemListener
})

// Cleanup on unmount
import { onUnmounted } from 'vue'
onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('keydown', handleKeydown)
  
  // Cleanup system dark mode listener
  if (window._darkModeCleanup) {
    window._darkModeCleanup()
    delete window._darkModeCleanup
  }
})
</script>

<template>
  <div class="app" :class="{ 'dark-mode': isDarkMode }">
    <header class="header">
      <h1>🇯🇵 JLPT Grammar Guide</h1>
      <p class="subtitle">Grammar Points <br/>for the Japanese Language Proficiency Test</p>
    </header>

    <div class="container">
      <!-- Loading State -->
      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <p>Loading grammar data...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error">
        <h3>❌ Error Loading Data</h3>
        <p>{{ error }}</p>
        <button @click="loadGrammarData()" class="retry-btn">Retry</button>
      </div>

      <!-- Main Content -->
      <div v-else>
        <!-- Filters -->
        <div class="filters">
          <div class="level-filter">
            <label for="level-select">JLPT Level:</label>
            <select id="level-select" v-model="selectedLevel" class="level-select">
              <option value="all">
                All Levels ({{ getTotalCount() }})
              </option>
              <option v-for="level in jlptLevels" :key="level" :value="level">
                N{{ level }} ({{ getLevelCount(level) }})
              </option>
              <option value="favorites">
                ⭐ Favorites ({{ getTotalFavoriteCount() }})
              </option>
            </select>
          </div>

          <div class="search-box">
            <input 
              v-model="searchTerm"
              type="text" 
              placeholder="Search grammar points..."
              class="search-input"
            >
            <button v-if="searchTerm" @click="clearSearch()" class="clear-btn">✕</button>
          </div>

          <button 
            @click="toggleFlashcardMode"
            class="flashcard-toggle"
            :class="{ active: isFlashcardMode }"
          >
            {{ isFlashcardMode ? '📋 List View' : '🃏 Flashcard Mode' }}
          </button>
        </div>

        <!-- Filter Loading State -->
        <div v-if="filterLoading" class="filter-loading">
          <div class="spinner"></div>
          <p>Filtering grammar points...</p>
        </div>

        <!-- Mode Loading State -->
        <div v-else-if="modeLoading" class="filter-loading">
          <div class="spinner"></div>
          <p>{{ isFlashcardMode ? 'Switching to List View...' : 'Switching to Flashcard Mode...' }}</p>
        </div>

        <!-- Results Summary -->
        <div v-else-if="searchTerm" class="results-summary">
          <p>
            Showing <strong>{{ filteredGrammar.length }}</strong> 
            of <strong>{{ grammarData.length }}</strong> grammar points
          </p>
        </div>

        <!-- Flashcard Mode -->
        <div v-if="!filterLoading && !modeLoading && isFlashcardMode && currentCard" class="flashcard-container">
          <!-- Flashcard Navigation - Desktop -->
          <div class="flashcard-nav desktop-nav">
            <button 
              @click="prevCard" 
              :disabled="currentCardIndex === 0"
              class="nav-btn prev-btn"
            >
              ← Previous
            </button>
            
            <div class="flashcard-counter">
              {{ currentCardIndex + 1 }} / {{ filteredGrammar.length }}
            </div>
            
            <button 
              @click="nextCard" 
              :disabled="currentCardIndex === filteredGrammar.length - 1"
              class="nav-btn next-btn"
            >
              Next →
            </button>
          </div>

          <!-- Mobile Swipe Info -->
          <div class="mobile-swipe-info">
            <!-- <div class="swipe-counter">
              {{ currentCardIndex + 1 }} / {{ filteredGrammar.length }}
            </div> -->
            <div class="swipe-instructions">
              <span class="swipe-icon">👈</span>
              <span class="swipe-text">Swipe over Flashcard to navigate</span>
              <span class="swipe-icon">👉</span>
            </div>
          </div>

          <!-- Stacked Flashcards -->
          <div class="flashcard-stack" 
               @touchstart="handleTouchStart"
               @touchend="handleTouchEnd">
            <!-- Background Cards (Next 3 cards) -->
            <div 
              v-for="(card, index) in getStackedCards()" 
              :key="`stacked-${card.no}-${index}`"
              class="flashcard flashcard-stacked"
              :class="{ 'swipe-animating': isSwipeAnimating }"
              :style="getStackedCardStyle(index)"
            >
              <!-- Simplified content for background cards -->
              <div class="grammar-number-top">{{ currentCardIndex + index + 2 }}</div>
              <div class="card-header">
                <div class="grammar-title">
                  <span class="kanji" v-if="card.kanji">{{ card.kanji }}</span>
                  <span class="kana" v-if="card.kana">{{ card.kana }}</span>
                </div>
                <div class="card-header-right">
                  <span :class="['level-badge', getLevelColor(card.n_level)]">
                    N{{ card.n_level }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Current Active Card -->
            <div 
              class="flashcard flashcard-active"
              :class="{ 'swipe-animating': isSwipeAnimating }"
            >
              <!-- Grammar Number at Top Right -->
              <div class="grammar-number-top">{{ currentCardIndex + 1 }}</div>
              
              <!-- Header -->
              <div class="card-header">
                <div class="grammar-title">
                  <span class="kanji" v-if="currentCard.kanji">{{ currentCard.kanji }}</span>
                  <span class="kana" v-if="currentCard.kana">{{ currentCard.kana }}</span>
                </div>
                <div class="card-header-right">
                  <button 
                    @click="toggleFavorite(currentCard.no)"
                    class="favorite-btn"
                    :class="{ active: isFavorite(currentCard.no) }"
                    :title="isFavorite(currentCard.no) ? 'Remove from favorites' : 'Add to favorites'"
                  >
                    {{ isFavorite(currentCard.no) ? '⭐' : '☆' }}
                  </button>
                  <span :class="['level-badge', getLevelColor(currentCard.n_level)]">
                    N{{ currentCard.n_level }}
                  </span>
                </div>
              </div>

              <!-- Meaning -->
              <div class="meaning">
                <strong>Meaning:</strong> {{ currentCard.meaning_mm }}
              </div>

              <!-- Usage Pattern -->
              <div class="usage" v-if="currentCard.where_to_use">
                <strong>Usage:</strong> 
                <code>{{ currentCard.where_to_use }}</code>
              </div>

              <!-- Sensei Note -->
              <div class="sensei-note" v-if="currentCard.sensei_note">
                <strong>📝 Sensei Note:</strong> {{ currentCard.sensei_note }}
              </div>

              <!-- Examples -->
              <div class="examples" v-if="currentCard.tmp_example">
                <strong>Examples:</strong>
                <div class="parsed-examples">
                  <div 
                    v-for="(example, index) in parseExamples(currentCard.tmp_example)" 
                    :key="index"
                    class="example-item"
                  >
                    <div class="japanese-text-container">
                      <div class="japanese-text" v-html="example.japanese"></div>
                      <button 
                        @click="playExampleAudio(currentCard.no, index)"
                        class="audio-play-btn"
                        title="Play audio"
                      >
                        🔊
                      </button>
                    </div>
                    <div class="myanmar-text" v-if="example.myanmar">{{ example.myanmar }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Keyboard Hints -->
          <div class="keyboard-hints">
            <span>← → Arrow keys to navigate</span>
            <span>ESC to exit flashcard mode</span>
          </div>
        </div>

        <!-- Grammar List (Normal View) -->
        <div v-if="!filterLoading && !modeLoading && !isFlashcardMode" class="grammar-list">
          <div 
            v-for="(item, index) in filteredGrammar" 
            :key="item.no"
            class="grammar-card"
          >
            <!-- Grammar Number at Top Right -->
            <div class="grammar-number-top">{{ index + 1 }}</div>
            
            <!-- Header -->
            <div class="card-header">
              <div class="grammar-title">
                <span class="kanji" v-if="item.kanji">{{ item.kanji }}</span>
                <span class="kana" v-if="item.kana">{{ item.kana }}</span>
              </div>
              <div class="card-header-right">
                <button 
                  @click="toggleFavorite(item.no)"
                  class="favorite-btn"
                  :class="{ active: isFavorite(item.no) }"
                  :title="isFavorite(item.no) ? 'Remove from favorites' : 'Add to favorites'"
                >
                  {{ isFavorite(item.no) ? '⭐' : '☆' }}
                </button>
                <span :class="['level-badge', getLevelColor(item.n_level)]">
                  N{{ item.n_level }}
                </span>
              </div>
            </div>

            <!-- Meaning -->
            <div class="meaning">
              <strong>Meaning:</strong> {{ item.meaning_mm }}
            </div>

            <!-- Usage Pattern -->
            <div class="usage" v-if="item.where_to_use">
              <strong>Usage:</strong> 
              <code>{{ item.where_to_use }}</code>
            </div>

            <!-- Sensei Note -->
            <div class="sensei-note" v-if="item.sensei_note">
              <strong>📝 Sensei Note:</strong> {{ item.sensei_note }}
            </div>

            <!-- Examples -->
            <div class="examples" v-if="item.tmp_example">
              <strong>Examples:</strong>
              <div class="parsed-examples">
                <div 
                  v-for="(example, index) in parseExamples(item.tmp_example)" 
                  :key="index"
                  class="example-item"
                >
                  <div class="japanese-text-container">
                    <div class="japanese-text" v-html="example.japanese"></div>
                    <button 
                      @click="playExampleAudio(item.no, index)"
                      class="audio-play-btn"
                      title="Play audio"
                    >
                      🔊
                    </button>
                  </div>
                  <div class="myanmar-text" v-if="example.myanmar">{{ example.myanmar }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="filteredGrammar.length === 0" class="empty-state">
          <h3>🔍 No Results Found</h3>
          <p>Try adjusting your search terms or filter settings.</p>
        </div>
      </div>
    </div>

    <!-- Audio Error Notification -->
    <div 
      v-if="showAudioError" 
      class="audio-error-notification"
      @click="hideAudioError"
    >
      <div class="audio-error-content">
        <span class="audio-error-icon">🔇</span>
        <span class="audio-error-message">{{ audioError }}</span>
        <button class="audio-error-close" @click="hideAudioError">✕</button>
      </div>
    </div>

    <!-- Back to Top Button -->
    <button 
      v-if="showBackToTop"
      @click="scrollToTop"
      class="back-to-top"
      aria-label="Back to top"
    >
      ↑
    </button>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  background: linear-gradient(135deg, #74b9ff 0%, #0984e3 50%, #00b894 100%);
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.header {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  padding: 2rem 0;
  text-align: center;
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
}

.header h1 {
  margin: 0;
  font-size: 2.5rem;
  color: #2c3e50;
  font-weight: 700;
}

.subtitle {
  margin: 0.5rem 0 0 0;
  color: #7f8c8d;
  font-size: 1.1rem;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem;
}

.loading, .filter-loading {
  text-align: center;
  padding: 4rem 0;
  color: white;
}

.filter-loading {
  padding: 2rem 0;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top: 4px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error {
  background: rgba(231, 76, 60, 0.9);
  color: white;
  padding: 2rem;
  border-radius: 10px;
  text-align: center;
}

.retry-btn {
  background: white;
  color: #e74c3c;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 5px;
  cursor: pointer;
  font-weight: 600;
  margin-top: 1rem;
}

.filters {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  align-items: center;
}

.search-box {
  position: relative;
  flex: 1;
  min-width: 200px;
  max-width: none;
}

.search-input {
  width: 100%;
  padding: 0.75rem 2.5rem 0.75rem 1rem;
  border: none;
  border-radius: 25px;
  font-size: 1rem;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.search-input:focus {
  outline: none;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.clear-btn {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: #7f8c8d;
  font-size: 1.2rem;
}

.level-filter {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: white;
  font-weight: 600;
}

.level-select {
  padding: 0.5rem;
  border: none;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.9);
  cursor: pointer;
}

.results-summary {
  color: white;
  margin-bottom: 1rem;
  text-align: center;
}

.grammar-list {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
}

.grammar-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 1.5rem;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  position: relative;
  padding-top: 2.5rem;
}

.grammar-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 12px 35px rgba(0, 0, 0, 0.15);
}

.grammar-number-top {
  position: absolute;
  top: -12px;
  right: -12px;
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
  border: 3px solid rgba(255, 255, 255, 0.95);
  z-index: 10;
  transition: all 0.3s ease;
}

.grammar-card:hover .grammar-number-top {
  transform: scale(1.1);
  box-shadow: 0 6px 16px rgba(52, 152, 219, 0.4);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.grammar-title {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.kanji, .kana {
  font-size: 1.5rem;
  font-weight: 700;
  color: #2c3e50;
}

.level-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 700;
  color: white;
}

.level-1 { background: #e74c3c; }
.level-2 { background: #e67e22; }
.level-3 { background: #f39c12; }
.level-4 { background: #27ae60; }
.level-5 { background: #3498db; }
.level-default { background: #95a5a6; }

.meaning, .usage, .examples, .sensei-note {
  margin-bottom: 1rem;
  line-height: 1.6;
}

.meaning strong, .usage strong, .examples strong, .sensei-note strong {
  color: #2c3e50;
  display: block;
  margin-bottom: 0.5rem;
}

.usage code {
  background: #f8f9fa;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  color: #e74c3c;
}

.example-text {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 8px;
  border-left: 4px solid #3498db;
  white-space: pre-line;
  font-size: 0.95rem;
  line-height: 1.7;
}

.parsed-examples {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.example-item {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 8px;
  border-left: 4px solid #3498db;
}

/* Japanese text container with audio button */
.japanese-text-container {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.japanese-text {
  font-size: 1rem;
  font-weight: 600;
  color: #2c3e50;
  line-height: 1.6;
  flex: 1;
}

/* Audio play button */
.audio-play-btn {
  background: linear-gradient(135deg, #27ae60, #2ecc71);
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.9rem;
  color: white;
  transition: all 0.3s ease;
  box-shadow: 0 2px 8px rgba(39, 174, 96, 0.3);
  flex-shrink: 0;
}

.audio-play-btn:hover {
  transform: translateY(-2px) scale(1.1);
  box-shadow: 0 4px 12px rgba(39, 174, 96, 0.4);
  background: linear-gradient(135deg, #2ecc71, #27ae60);
}

.audio-play-btn:active {
  transform: translateY(0) scale(1.05);
  box-shadow: 0 2px 6px rgba(39, 174, 96, 0.3);
}

.myanmar-text {
  font-size: 0.95rem;
  color: #7f8c8d;
  line-height: 1.7;
  font-style: italic;
}

/* Ruby/Furigana styles */
.japanese-text ruby {
  ruby-align: center;
  ruby-position: over;
}

.japanese-text rt {
  font-size: 0.7em;
  color: #555;
  font-weight: normal;
  line-height: 1.2;
  text-align: center;
  display: block;
  margin-bottom: 2px;
}

/* Enhanced fallback for browsers that don't support ruby */
.japanese-text ruby {
  display: inline-block;
  text-align: center;
  vertical-align: baseline;
  white-space: nowrap;
  line-height: 1;
}

.japanese-text ruby > rt {
  display: block;
  font-size: 0.7em;
  line-height: 1.2;
  text-align: center;
  color: #555;
  font-weight: normal;
  margin-bottom: 2px;
  white-space: nowrap;
}

.japanese-text ruby > rb {
  display: block;
  line-height: 1.4;
}

.sensei-note {
  background: #fff3cd;
  padding: 1rem;
  border-radius: 8px;
  border-left: 4px solid #ffc107;
}

.empty-state {
  text-align: center;
  color: white;
  padding: 4rem 0;
}

.empty-state h3 {
  font-size: 2rem;
  margin-bottom: 1rem;
}

/* Back to Top Button */
.back-to-top {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 50px;
  height: 50px;
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: white;
  border: none;
  border-radius: 50%;
  font-size: 1.5rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(52, 152, 219, 0.3);
  transition: all 0.3s ease;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.back-to-top:hover {
  transform: translateY(-3px) scale(1.1);
  box-shadow: 0 6px 20px rgba(52, 152, 219, 0.4);
  background: linear-gradient(135deg, #2980b9, #3498db);
}

.back-to-top:active {
  transform: translateY(-1px) scale(1.05);
}

/* Favorites Toggle Button */
.favorites-toggle {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 25px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  background: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
}

.favorites-toggle:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

.favorites-toggle.active {
  background: linear-gradient(135deg, #f39c12, #e67e22);
  color: white;
}

/* Flashcard Toggle Button */
.flashcard-toggle {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 25px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  background: rgba(255, 255, 255, 0.9);
  color: #2c3e50;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
  white-space: nowrap;
  margin-left: 50px;
}

.flashcard-toggle:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

.flashcard-toggle.active {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: white;
}

/* Card Header Right */
.card-header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

/* Favorite Button */
.favorite-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  transition: all 0.3s ease;
  padding: 0.25rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
}

.favorite-btn:hover {
  background: rgba(255, 193, 7, 0.1);
  transform: scale(1.1);
}

.favorite-btn.active {
  color: #ffc107;
  animation: favoriteAdded 0.3s ease;
}

.favorite-btn:not(.active) {
  color: #bdc3c7;
}

@keyframes favoriteAdded {
  0% { transform: scale(1); }
  50% { transform: scale(1.3); }
  100% { transform: scale(1); }
}

/* Flashcard Container */
.flashcard-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  max-width: 800px;
  margin: 0 auto;
}

/* Flashcard Navigation */
.flashcard-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 400px;
  gap: 2rem;
}

.nav-btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 25px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: white;
  box-shadow: 0 4px 15px rgba(52, 152, 219, 0.3);
}

.nav-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(52, 152, 219, 0.4);
}

.nav-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.flashcard-counter {
  font-size: 1.2rem;
  font-weight: 700;
  color: white;
  text-align: center;
  min-width: 100px;
}

/* Mobile Swipe Info */
.mobile-swipe-info {
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  width: 100%;
  max-width: 400px;
}

.swipe-counter {
  font-size: 1.2rem;
  font-weight: 700;
  color: white;
  text-align: center;
}

.swipe-instructions {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: rgba(255, 255, 255, 0.1);
  padding: 0.75rem 1.5rem;
  border-radius: 25px;
  backdrop-filter: blur(10px);
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.9rem;
  font-weight: 600;
}

.swipe-icon {
  font-size: 1.2rem;
  animation: swipeHint 2s ease-in-out infinite;
}

.swipe-text {
  white-space: nowrap;
}

@keyframes swipeHint {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  75% { transform: translateX(3px); }
}

/* Flashcard Stack Container */
.flashcard-stack {
  position: relative;
  width: 100%;
  max-width: 750px;
  min-height: 500px;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1000px;
  overflow: hidden; /* Prevent cards from overflowing */
  padding: 20px; /* Add padding to contain stacked cards */
  box-sizing: border-box;
}

/* Single Flashcard */
.flashcard {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 15px;
  padding: 1.5rem;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  position: absolute;
  width: calc(100% - 40px); /* Account for container padding */
  max-width: 710px; /* Reduced to fit within container */
  min-height: 450px;
  padding-top: 2.5rem;
  color: #2c3e50;
  overflow: visible;
  box-sizing: border-box;
}

/* Active Flashcard (front card) */
.flashcard-active {
  z-index: 20;
  position: relative;
}

/* Stacked Flashcards (background cards) */
.flashcard-stacked {
  pointer-events: none;
  cursor: default;
}

.flashcard-stacked .card-header {
  margin-bottom: 2rem;
}

.flashcard-stacked .meaning,
.flashcard-stacked .usage,
.flashcard-stacked .examples,
.flashcard-stacked .sensei-note {
  display: none;
}

.flashcard::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(45deg, 
    rgba(255, 255, 255, 0.1) 0%, 
    transparent 50%, 
    rgba(255, 255, 255, 0.05) 100%);
  pointer-events: none;
}

.flashcard:hover {
  transform: translateY(-12px) rotateX(5deg);
  box-shadow: 0 30px 80px rgba(102, 126, 234, 0.4), 
              0 10px 30px rgba(118, 75, 162, 0.3),
              inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.flashcard .grammar-number-top {
  width: 50px;
  height: 50px;
  font-size: 1.3rem;
  top: -20px;
  right: -20px;
  background: linear-gradient(135deg, #ff6b6b, #ee5a52);
  border: 4px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 8px 25px rgba(255, 107, 107, 0.4);
}

.flashcard .kanji, .flashcard .kana {
  font-size: 1.5rem;
  color: #2c3e50;
  font-weight: 700;
}

.flashcard .grammar-number-top {
  width: 32px;
  height: 32px;
  font-size: 0.9rem;
  top: -12px;
  right: -12px;
  background: linear-gradient(135deg, #3498db, #2980b9);
  border: 3px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.3);
}

.flashcard .favorite-btn:not(.active) {
  color: #bdc3c7;
}

.flashcard .favorite-btn.active {
  color: #ffc107;
}

/* Swipe Animation */
.flashcard.swipe-animating {
  transform: scale(0.98);
  transition: transform 0.3s ease;
}

/* Keyboard Hints */
.keyboard-hints {
  display: flex;
  gap: 2rem;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.9rem;
  text-align: center;
}

.keyboard-hints span {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.5rem 1rem;
  border-radius: 20px;
  backdrop-filter: blur(10px);
}

/* Medium screens - adjust layout before mobile breakpoint */
@media (max-width: 1024px) {
  .search-box {
    min-width: 180px;
  }
  
  .flashcard-toggle {
    padding: 0.6rem 0.8rem;
    font-size: 0.85rem;
  }
}

/* Small desktop screens - prevent wrapping */
@media (max-width: 900px) and (min-width: 769px) {
  .search-box {
    min-width: 150px;
  }
  
  .flashcard-toggle {
    padding: 0.5rem 0.7rem;
    font-size: 0.8rem;
  }
  
  .level-select {
    padding: 0.4rem;
    font-size: 0.9rem;
  }
}

/* Responsive Design */
@media (max-width: 768px) {
  .header h1 {
    font-size: 2rem;
  }
  
  .container {
    padding: 1rem 0.5rem;
  }
  
  .filters {
    flex-direction: column;
    align-items: stretch;
    padding: 0 0.5rem;
    flex-wrap: wrap;
  }
  
  .search-box {
    min-width: auto;
    max-width: none;
    width: 100%;
  }
  
  .search-input {
    width: calc(100% - 1rem);
    min-width: 0;
    box-sizing: border-box;
  }
  
  .level-filter {
    justify-content: center;
  }
  
  /* Remove left margin on mobile */
  .flashcard-toggle {
    margin-left: 0;
  }
  
  .grammar-list {
    grid-template-columns: 1fr;
    padding: 0 0.5rem;
  }
  
  .grammar-card {
    padding: 1rem;
  }
  
  .card-header {
    flex-direction: column;
    gap: 1rem;
  }

  /* Flashcard responsive adjustments */
  .flashcard-container {
    max-width: 100%;
    padding: 0 0.5rem;
    gap: 1.5rem;
  }
  
  /* Hide desktop nav, show mobile swipe info */
  .desktop-nav {
    display: none;
  }
  
  .mobile-swipe-info {
    display: flex;
  }
  
  .flashcard-nav {
    max-width: 100%;
    gap: 1rem;
  }
  
  .nav-btn {
    padding: 0.6rem 1rem;
    font-size: 0.9rem;
  }
  
  .flashcard-counter {
    font-size: 1rem;
    min-width: 80px;
  }
  
  /* Mobile flashcard stack adjustments */
  .flashcard-stack {
    max-width: 100%;
    min-height: 400px;
    padding: 15px;
    overflow: hidden;
  }
  
  .flashcard {
    padding: 1.5rem;
    padding-top: 2.5rem;
    min-height: 350px;
    width: calc(100% - 30px);
    max-width: calc(100% - 30px);
    margin: 0;
  }
  
  .flashcard .kanji, .flashcard .kana {
    font-size: 1.8rem;
  }
  
  .keyboard-hints {
    display: none;
  }
}

/* Extra small screens */
@media (max-width: 480px) {
  .container {
    padding: 1rem 0.25rem;
  }
  
  .filters {
    padding: 0 0.25rem;
  }
  
  .search-input {
    width: calc(100% - 0.5rem);
    padding: 0.75rem 2.5rem 0.75rem 0.75rem;
  }
  
  .grammar-list {
    padding: 0 0.25rem;
  }
  
  .grammar-card {
    padding: 0.75rem;
  }

  /* Extra small flashcard adjustments */
  .flashcard-container {
    padding: 0 0.25rem;
    gap: 0.75rem;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }
  
  .flashcard-nav {
    flex-direction: column;
    gap: 0.75rem;
    align-items: center;
    width: 100%;
    max-width: 100%;
  }
  
  .nav-btn {
    padding: 0.5rem 0.75rem;
    font-size: 0.8rem;
    width: 110px;
    max-width: 45%;
  }
  
  .flashcard-counter {
    order: -1;
    font-size: 0.85rem;
  }
  
  /* Extra small flashcard stack - more constrained */
  .flashcard-stack {
    max-width: 100%;
    min-height: 320px;
    padding: 10px;
    overflow: hidden;
  }
  
  .flashcard {
    padding: 0.75rem;
    padding-top: 1.75rem;
    min-height: 280px;
    border-radius: 12px;
    width: calc(100% - 20px);
    max-width: calc(100% - 20px);
    margin: 0;
    box-sizing: border-box;
  }
  
  .flashcard .grammar-number-top {
    width: 30px;
    height: 30px;
    font-size: 0.9rem;
    top: -10px;
    right: -10px;
  }
  
  .flashcard .kanji, .flashcard .kana {
    font-size: 1.3rem;
    word-break: break-word;
  }
  
  .flashcard .card-header {
    flex-direction: column;
    gap: 0.5rem;
    align-items: flex-start;
  }
  
  .flashcard .meaning, 
  .flashcard .usage, 
  .flashcard .examples, 
  .flashcard .sensei-note {
    margin-bottom: 0.75rem;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  
  .flashcard .example-item {
    padding: 0.75rem;
  }
  
  .keyboard-hints {
    font-size: 0.7rem;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }
  
  .keyboard-hints span {
    padding: 0.3rem 0.6rem;
    font-size: 0.65rem;
  }
}

/* Dark Mode Styles */
.app.dark-mode {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}

.app.dark-mode .header {
  background: rgba(30, 30, 30, 0.95);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.3);
}

.app.dark-mode .header h1 {
  color: #e8e8e8;
}

.app.dark-mode .subtitle {
  color: #b0b0b0;
}

.app.dark-mode .level-filter {
  color: #e8e8e8;
}

.app.dark-mode .level-select {
  background: rgba(40, 40, 40, 0.9);
  color: #e8e8e8;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.app.dark-mode .search-input {
  background: rgba(40, 40, 40, 0.9);
  color: #e8e8e8;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.app.dark-mode .search-input::placeholder {
  color: #888;
}

.app.dark-mode .clear-btn {
  color: #b0b0b0;
}

.app.dark-mode .flashcard-toggle {
  background: rgba(40, 40, 40, 0.9);
  color: #e8e8e8;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.app.dark-mode .flashcard-toggle:hover {
  background: rgba(50, 50, 50, 0.9);
}

.app.dark-mode .flashcard-toggle.active {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: white;
  border: 1px solid transparent;
}

.app.dark-mode .grammar-card,
.app.dark-mode .flashcard {
  background: rgba(40, 40, 40, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
}

.app.dark-mode .grammar-card:hover,
.app.dark-mode .flashcard:hover {
  box-shadow: 0 12px 35px rgba(0, 0, 0, 0.4);
}

.app.dark-mode .kanji,
.app.dark-mode .kana {
  color: #e8e8e8;
}

.app.dark-mode .meaning strong,
.app.dark-mode .usage strong,
.app.dark-mode .examples strong,
.app.dark-mode .sensei-note strong {
  color: #e8e8e8;
}

.app.dark-mode .meaning,
.app.dark-mode .usage,
.app.dark-mode .examples {
  color: #d0d0d0;
}

.app.dark-mode .usage code {
  background: rgba(60, 60, 60, 0.8);
  color: #ff6b6b;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.app.dark-mode .example-item {
  background: rgba(50, 50, 50, 0.8);
  border-left: 4px solid #4a9eff;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.app.dark-mode .japanese-text {
  color: #e8e8e8;
}

.app.dark-mode .japanese-text rt {
  color: #b0b0b0;
}

.app.dark-mode .myanmar-text {
  color: #b0b0b0;
}

.app.dark-mode .sensei-note {
  background: rgba(60, 50, 30, 0.8);
  border-left: 4px solid #ffc107;
  border: 1px solid rgba(255, 193, 7, 0.2);
  color: #f0f0f0;
}

.app.dark-mode .error {
  background: rgba(231, 76, 60, 0.9);
  border: 1px solid rgba(231, 76, 60, 0.3);
}

.app.dark-mode .retry-btn {
  background: #e8e8e8;
  color: #e74c3c;
}

.app.dark-mode .nav-btn {
  background: linear-gradient(135deg, #4a9eff, #357abd);
  border: 1px solid rgba(74, 158, 255, 0.3);
}

.app.dark-mode .nav-btn:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(74, 158, 255, 0.4);
}

.app.dark-mode .back-to-top {
  background: linear-gradient(135deg, #4a9eff, #357abd);
  border: 1px solid rgba(74, 158, 255, 0.3);
}

.app.dark-mode .back-to-top:hover {
  background: linear-gradient(135deg, #357abd, #4a9eff);
  box-shadow: 0 6px 20px rgba(74, 158, 255, 0.4);
}

.app.dark-mode .audio-play-btn {
  background: linear-gradient(135deg, #2ecc71, #27ae60);
  box-shadow: 0 2px 8px rgba(46, 204, 113, 0.3);
}

.app.dark-mode .audio-play-btn:hover {
  background: linear-gradient(135deg, #27ae60, #2ecc71);
  box-shadow: 0 4px 12px rgba(46, 204, 113, 0.4);
}

.app.dark-mode .audio-play-btn:active {
  box-shadow: 0 2px 6px rgba(46, 204, 113, 0.3);
}

/* Audio Error Notification */
.audio-error-notification {
  position: fixed;
  top: 2rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2000;
  cursor: pointer;
  animation: slideInDown 0.3s ease-out;
}

.audio-error-content {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: white;
  padding: 1rem 1.5rem;
  border-radius: 10px;
  box-shadow: 0 8px 25px rgba(231, 76, 60, 0.4);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  gap: 1rem;
  max-width: 400px;
  min-width: 300px;
}

.audio-error-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.audio-error-message {
  flex: 1;
  font-size: 0.9rem;
  line-height: 1.4;
}

.audio-error-close {
  background: none;
  border: none;
  color: white;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 50%;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  flex-shrink: 0;
}

.audio-error-close:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

@keyframes slideInDown {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-100%);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

/* Dark mode audio error notification */
.app.dark-mode .audio-error-content {
  background: linear-gradient(135deg, #c0392b, #a93226);
  box-shadow: 0 8px 25px rgba(192, 57, 43, 0.4);
}

/* Responsive audio error notification */
@media (max-width: 768px) {
  .audio-error-notification {
    top: 1rem;
    left: 1rem;
    right: 1rem;
    transform: none;
  }
  
  .audio-error-content {
    min-width: auto;
    max-width: none;
    width: 100%;
  }
}

@media (max-width: 480px) {
  .audio-error-notification {
    top: 0.5rem;
    left: 0.5rem;
    right: 0.5rem;
  }
  
  .audio-error-content {
    padding: 0.75rem 1rem;
    gap: 0.75rem;
  }
  
  .audio-error-message {
    font-size: 0.85rem;
  }
  
  .audio-error-icon {
    font-size: 1.3rem;
  }
}

/* Dark mode responsive adjustments */
@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    gap: 1rem;
    padding: 0 0.5rem;
  }
  
  .dark-mode-toggle {
    position: static;
    transform: none;
    width: 45px;
    height: 45px;
    font-size: 1.3rem;
  }
  
  .dark-mode-toggle:hover {
    transform: scale(1.1);
  }
  
  .header-text {
    text-align: center;
  }
}

@media (max-width: 480px) {
  .header-content {
    padding: 0 0.25rem;
  }
  
  .dark-mode-toggle {
    width: 40px;
    height: 40px;
    font-size: 1.2rem;
  }
}
</style>
