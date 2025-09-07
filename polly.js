import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import fs from "fs";
import path from "path";

// Function to remove furigana (text in parentheses) from Japanese text
function removeFurigana(text) {
  return text.replace(/\([^)]*\)/g, '');
}

// Function to split examples by Myanmar period (။)
function splitExamples(exampleText) {
  return exampleText.split('။').map(example => example.trim()).filter(example => example.length > 0);
}

// Function to extract Japanese text from example (before Myanmar translation)
function extractJapaneseText(example) {
  // Split by Myanmar text and take the first part (Japanese)
  const parts = example.split(/[\u1000-\u109F]+/);
  return parts[0].trim();
}

async function generateTTS(text, outputFile) {
  // Create Polly client
  const client = new PollyClient({ region: process.env.AWS_REGION || "ap-northeast-1" });

  // Prepare synthesis request
  const params = {
    Engine: "neural",          // neural engine for higher quality
    OutputFormat: "mp3",       // mp3, ogg_vorbis, or pcm
    Text: text,
    TextType: "text",          // or "ssml"
    VoiceId: "Takumi"          // Japanese male neural voice
  };

  try {
    const command = new SynthesizeSpeechCommand(params);
    const response = await client.send(command);

    // Ensure voices directory exists
    const voicesDir = path.dirname(outputFile);
    if (!fs.existsSync(voicesDir)) {
      fs.mkdirSync(voicesDir, { recursive: true });
    }

    // Save audio stream to file
    const writeStream = fs.createWriteStream(outputFile);
    response.AudioStream.pipe(writeStream);

    return new Promise((resolve, reject) => {
      writeStream.on("finish", () => {
        console.log(`✅ Audio saved to ${outputFile}`);
        resolve();
      });
      writeStream.on("error", (err) => {
        console.error(`❌ Error saving audio to ${outputFile}:`, err);
        reject(err);
      });
    });
  } catch (err) {
    console.error("❌ Polly error:", err);
    throw err;
  }
}

async function processGrammarData() {
  try {
    // Read the JSON data file
    const dataPath = path.join(process.cwd(), 'public', 'jlpt_bunpou_data.json');
    const jsonData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    
    console.log(`📚 Processing ${jsonData.length} grammar points from jlpt_bunpou_data.json`);
    
    // Process all grammar points
    for (const grammar of jsonData) {
      console.log(`\n📖 Processing grammar point no. ${grammar.no}: ${grammar.kanji || grammar.kana}`);
      
      // Skip if no examples
      if (!grammar.tmp_example || grammar.tmp_example.trim() === '') {
        console.log(`⚠️ No examples found for grammar point no. ${grammar.no}, skipping...`);
        continue;
      }

      // test purpose
      // if (grammar.no < 368) continue;
      
      // Split examples by Myanmar period
      const examples = splitExamples(grammar.tmp_example);
      
      console.log(`📝 Found ${examples.length} examples`);
      
      // Process each example
      for (let i = 0; i < examples.length; i++) {
        const example = examples[i];
        
        // Extract Japanese text (before Myanmar translation)
        const japaneseText = extractJapaneseText(example);
        
        if (!japaneseText) {
          console.log(`⚠️ No Japanese text found in example ${i + 1}, skipping...`);
          continue;
        }
        
        // Remove furigana (text in parentheses)
        const cleanText = removeFurigana(japaneseText);
        
        if (!cleanText.trim()) {
          console.log(`⚠️ No text remaining after furigana removal in example ${i + 1}, skipping...`);
          continue;
        }
        
        // Generate output filename
        const outputFile = path.join(process.cwd(), 'public', 'voices', `example-${grammar.no}`, `${i + 1}.mp3`);
        
        console.log(`🎵 Generating TTS for example ${i + 1}:`);
        console.log(`   Original: ${japaneseText}`);
        console.log(`   Clean: ${cleanText}`);
        console.log(`   Output: ${outputFile}`);
        
        try {
          await generateTTS(cleanText, outputFile);
        } catch (error) {
          console.error(`❌ Failed to generate TTS for example ${i + 1}:`, error);
        }
      }
    }
    
    console.log('\n🎉 TTS generation completed for all grammar points!');
    
  } catch (error) {
    console.error('❌ Error processing grammar data:', error);
  }
}

// Run the processing
processGrammarData();
