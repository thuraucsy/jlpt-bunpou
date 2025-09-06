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

  // Filter by JLPT level
  if (selectedLevel.value !== 'all') {
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

// Watch for level changes and save to localStorage
watch(selectedLevel, async (newLevel) => {
  saveLevelPreference(newLevel)
  
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
  loadGrammarData()
  
  // Add scroll event listener
  window.addEventListener('scroll', handleScroll)
})

// Cleanup on unmount
import { onUnmounted } from 'vue'
onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <div class="app">
    <header class="header">
      <h1>🇯🇵 JLPT Grammar Guide</h1>
      <p class="subtitle">Japanese Language Proficiency Test <br/>Grammar Points</p>
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
          <div class="search-box">
            <input 
              v-model="searchTerm"
              type="text" 
              placeholder="Search grammar points..."
              class="search-input"
            >
            <button v-if="searchTerm" @click="clearSearch()" class="clear-btn">✕</button>
          </div>

          <div class="level-filter">
            <label for="level-select">JLPT Level:</label>
            <select id="level-select" v-model="selectedLevel" class="level-select">
              <option value="all">All Levels ({{ getTotalCount() }})</option>
              <option v-for="level in jlptLevels" :key="level" :value="level">
                N{{ level }} ({{ getLevelCount(level) }})
              </option>
            </select>
          </div>
        </div>

        <!-- Filter Loading State -->
        <div v-if="filterLoading" class="filter-loading">
          <div class="spinner"></div>
          <p>Filtering grammar points...</p>
        </div>

        <!-- Results Summary -->
        <div v-else class="results-summary">
          <p>
            Showing <strong>{{ filteredGrammar.length }}</strong> 
            of <strong>{{ grammarData.length }}</strong> grammar points
          </p>
        </div>

        <!-- Grammar List -->
        <div v-if="!filterLoading" class="grammar-list">
          <div 
            v-for="(item, index) in filteredGrammar" 
            :key="item.no"
            class="grammar-card"
          >
            <!-- Grammar Number at Top Center -->
            <div class="grammar-number-top">{{ index + 1 }}</div>
            
            <!-- Header -->
            <div class="card-header">
              <div class="grammar-title">
                <span class="kanji" v-if="item.kanji">{{ item.kanji }}</span>
                <span class="kana" v-if="item.kana">{{ item.kana }}</span>
              </div>
              <span :class="['level-badge', getLevelColor(item.n_level)]">
                N{{ item.n_level }}
              </span>
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
  min-width: 300px;
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
  }
  
  .search-box {
    min-width: auto;
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
}
</style>
