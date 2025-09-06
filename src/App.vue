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

// Load grammar data
const loadGrammarData = async () => {
  try {
    loading.value = true
    const response = await fetch('/jlpt_bunpou_data.json')
    if (!response.ok) {
      throw new Error('Failed to load grammar data')
    }
    const data = await response.json()
    grammarData.value = data.sort((a, b) => a.n_level - b.n_level || a.no - b.no)
    loading.value = false
  } catch (err) {
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
        <div v-else class="results-summary">
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
            <div class="swipe-counter">
              {{ currentCardIndex + 1 }} / {{ filteredGrammar.length }}
            </div>
            <div class="swipe-instructions">
              <span class="swipe-icon">👈</span>
              <span class="swipe-text">Swipe to navigate</span>
              <span class="swipe-icon">👉</span>
            </div>
          </div>

          <!-- Single Flashcard -->
          <div 
            class="flashcard"
            @touchstart="handleTouchStart"
            @touchend="handleTouchEnd"
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
                  <div class="japanese-text" v-html="example.japanese"></div>
                  <div class="myanmar-text" v-if="example.myanmar">{{ example.myanmar }}</div>
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
                  <div class="japanese-text" v-html="example.japanese"></div>
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

.japanese-text {
  font-size: 1rem;
  font-weight: 600;
  color: #2c3e50;
  margin-bottom: 0.5rem;
  line-height: 1.6;
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

/* Single Flashcard */
.flashcard {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 2rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  position: relative;
  width: 100%;
  max-width: 700px;
  min-height: 400px;
  padding-top: 3rem;
}

.flashcard:hover {
  transform: translateY(-8px);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.flashcard .grammar-number-top {
  width: 40px;
  height: 40px;
  font-size: 1.1rem;
  top: -15px;
  right: -15px;
}

.flashcard .kanji, .flashcard .kana {
  font-size: 2rem;
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
  
  .flashcard {
    padding: 1.5rem;
    padding-top: 2.5rem;
    min-height: 350px;
    max-width: 100%;
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

  /* Extra small flashcard adjustments - behave like list view */
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
  
  .flashcard {
    padding: 0.75rem;
    padding-top: 1.75rem;
    min-height: 280px;
    border-radius: 12px;
    width: 100%;
    max-width: 100%;
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
