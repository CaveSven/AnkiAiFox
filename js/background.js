// Store generated cards by URL
let cardsByUrl = new Map();

// Load cards from storage on startup
browser.storage.local.get(['cardsByUrl']).then(result => {
  if (result.cardsByUrl) {
    cardsByUrl = new Map(Object.entries(result.cardsByUrl));
  }
});

// Save cards to storage
async function saveCardsToStorage() {
  const cardsObject = Object.fromEntries(cardsByUrl);
  await browser.storage.local.set({ cardsByUrl: cardsObject });
}

// Listen for messages from popup and content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'processWithLLM') {
    processWithLLM(message.data)
      .then(cards => {
        // Store cards with the current URL
        const url = message.data.url;
        cardsByUrl.set(url, cards);
        saveCardsToStorage();
        sendResponse({ cards });
      })
      .catch(error => {
        console.error('Error processing with LLM:', error);
        sendResponse({ error: 'Failed to process with LLM' });
      });
    return true; // Keep the message channel open for the async response
  } 
  else if (message.action === 'updateCard') {
    const { index, card, url } = message.data;
    const cards = cardsByUrl.get(url) || [];
    cards[index] = card;
    cardsByUrl.set(url, cards);
    saveCardsToStorage();
    sendResponse({ success: true });
    return false;
  } 
  else if (message.action === 'rejectCard') {
    const { index, url } = message.data;
    const cards = cardsByUrl.get(url) || [];
    cards.splice(index, 1);
    cardsByUrl.set(url, cards);
    saveCardsToStorage();
    sendResponse({ success: true });
    return false;
  } 
  else if (message.action === 'submitToAnki') {
    const { url } = message.data;
    const cards = cardsByUrl.get(url) || [];
    submitToAnki(message.data)
      .then(result => {
        sendResponse({ success: true, count: result.count });
        // Clear the cards for this URL after successful submission
        cardsByUrl.delete(url);
        saveCardsToStorage();
      })
      .catch(error => {
        console.error('Error submitting to Anki:', error);
        sendResponse({ error: 'Failed to submit to Anki' });
      });
    return true; // Keep the message channel open for the async response
  }
  else if (message.action === 'getCardsForUrl') {
    const { url } = message.data;
    const cards = cardsByUrl.get(url) || [];
    sendResponse({ cards });
    return false;
  }
});

// Process content with LLM (OpenAI API)
async function processWithLLM(data) {
  const { prompt, apiKey, apiAddress, model, noteType, url } = data;
  
  try {
    const response = await fetch(`${apiAddress}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'system',
            content: noteType?.toLowerCase().includes('cloze') 
              ? 'You are a helpful assistant that creates high-quality Anki cloze deletion cards from provided content. Your task is to identify key concepts, facts, and relationships and turn them into effective cloze deletions. You can create multiple cloze deletions in a single card, numbered c1, c2, etc. You can also include optional hints in the format {{cN::text::hint}}.'
              : 'You are a helpful assistant that creates high-quality Anki flashcards from provided content. Your task is to identify key concepts, facts, and relationships and turn them into effective question-answer pairs.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(`API error: ${errorData.error?.message || 'Unknown error'}`);
    }
    
    const data = await response.json().catch(() => {
      throw new Error('Invalid JSON response from API');
    });
    
    const content = data.choices && data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content returned from LLM');
    }
    
    // Try to parse the JSON response
    try {
      // Find JSON array in the response (in case there's additional text)
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        const cards = JSON.parse(jsonMatch[0]);
        
        // For Cloze notes, make sure they have the required structure
        if (noteType?.toLowerCase().includes('cloze')) {
          return cards.filter(card => card && card.front).map(card => ({
            front: card.front,
            back: '' // Back is not used for cloze notes
          }));
        }
        
        return cards.filter(card => card && card.front && card.back);
      } else {
        throw new Error('No JSON array found in LLM response');
      }
    } catch (parseError) {
      console.error('Error parsing LLM response:', parseError);
      
      // Fallback: Try to extract front/back pairs using regex
      if (noteType?.toLowerCase().includes('cloze')) {
        // Match any cloze deletions including those with hints
        const clozeRegex = /\{\{c\d+::[^:}]+(?:::[^}]+)?\}\}/g;
        const content = data.choices[0]?.message?.content || '';
        
        // First, try to find complete sentences or paragraphs with cloze deletions
        const paragraphsWithClozes = content.match(/[^.\n]+\{\{c\d+::[^}]+\}\}[^.\n]*[.\n]/g);
        
        if (paragraphsWithClozes && paragraphsWithClozes.length > 0) {
          return paragraphsWithClozes.map(paragraph => ({
            front: paragraph.trim(),
            back: ''
          }));
        }
        
        // If no paragraphs found, extract any cloze deletions
        const clozeMatches = content.match(clozeRegex);
        if (clozeMatches && clozeMatches.length > 0) {
          // Try to extract surrounding context for each cloze
          const clozeCards = [];
          
          // First look for full sentences/context with the cloze pattern
          for (const match of clozeMatches) {
            // Try to find a sentence containing this cloze
            const clozeIndex = content.indexOf(match);
            if (clozeIndex >= 0) {
              // Look for sentence boundaries (period, question mark, etc.) or paragraph breaks
              let sentenceStart = content.lastIndexOf('.', clozeIndex);
              sentenceStart = Math.max(sentenceStart, content.lastIndexOf('?', clozeIndex));
              sentenceStart = Math.max(sentenceStart, content.lastIndexOf('!', clozeIndex));
              sentenceStart = Math.max(sentenceStart, content.lastIndexOf('\n', clozeIndex));
              
              let sentenceEnd = content.indexOf('.', clozeIndex + match.length);
              sentenceEnd = (sentenceEnd === -1) ? content.indexOf('?', clozeIndex + match.length) : Math.min(sentenceEnd, content.indexOf('?', clozeIndex + match.length));
              sentenceEnd = (sentenceEnd === -1) ? content.indexOf('!', clozeIndex + match.length) : Math.min(sentenceEnd, content.indexOf('!', clozeIndex + match.length));
              sentenceEnd = (sentenceEnd === -1) ? content.indexOf('\n', clozeIndex + match.length) : Math.min(sentenceEnd, content.indexOf('\n', clozeIndex + match.length));
              
              if (sentenceStart !== -1 && sentenceEnd !== -1) {
                const sentence = content.substring(sentenceStart + 1, sentenceEnd + 1).trim();
                if (sentence) {
                  clozeCards.push({
                    front: sentence,
                    back: ''
                  });
                  continue;
                }
              }
            }
            
            // Fallback: just use the cloze itself
            clozeCards.push({
              front: match,
              back: ''
            });
          }
          
          return clozeCards;
        }
      } else {
        const cardMatches = content.match(/front["\s:]+([^"]+)["\s,]+back["\s:]+([^"]+)/gi);
        
        if (cardMatches && cardMatches.length > 0) {
          return cardMatches.map(match => {
            const frontMatch = match.match(/front["\s:]+([^"]+)/i);
            const backMatch = match.match(/back["\s:]+([^"]+)/i);
            
            return {
              front: frontMatch ? frontMatch[1].trim() : '',
              back: backMatch ? backMatch[1].trim() : ''
            };
          }).filter(card => card.front && card.back);
        }
      }
      
      // If all parsing attempts fail, return an empty array rather than throwing
      console.error('Failed to parse cards from LLM response, returning empty array');
      return [];
    }
  } catch (error) {
    console.error('Error in processWithLLM:', error);
    throw error;
  }
}

// Submit cards to Anki via AnkiConnect
async function submitToAnki(data) {
  const { deckName, noteType, url } = data;
  const isClozeFormat = noteType.toLowerCase().includes('cloze');
  const cards = cardsByUrl.get(url) || [];
  
  if (!cards || cards.length === 0) {
    throw new Error('No cards to submit');
  }
  
  try {
    // First check if AnkiConnect is available
    const versionResponse = await fetch('http://localhost:8765', {
      method: 'POST',
      body: JSON.stringify({
        action: 'version',
        version: 6
      })
    });
    
    if (!versionResponse.ok) {
      throw new Error('Failed to connect to AnkiConnect. Make sure Anki is running with AnkiConnect addon installed.');
    }
    
    // Create notes in Anki
    const createNotesResponse = await fetch('http://localhost:8765', {
      method: 'POST',
      body: JSON.stringify({
        action: 'addNotes',
        version: 6,
        params: {
          notes: cards.map(card => {
            // Handle different note types
            if (isClozeFormat) {
              return {
                deckName,
                modelName: noteType,
                fields: {
                  Text: card.front,
                  // Some cloze models also have a Back field for extra info
                  Back: card.back || ''
                },
                options: {
                  allowDuplicate: false
                },
                tags: ['ankiaifox']
              };
            } else {
              return {
                deckName,
                modelName: noteType,
                fields: {
                  Front: card.front,
                  Back: card.back
                },
                options: {
                  allowDuplicate: false
                },
                tags: ['ankiaifox']
              };
            }
          })
        }
      })
    });
    
    const createNotesResult = await createNotesResponse.json();
    
    if (createNotesResult.error) {
      throw new Error(`AnkiConnect error: ${createNotesResult.error}`);
    }
    
    // Count successful notes (filtering out null values which indicate failed additions)
    const successCount = createNotesResult.result.filter(id => id !== null).length;
    
    // Only clear cards from storage if submission was successful
    if (successCount > 0) {
      cardsByUrl.delete(url);
      await saveCardsToStorage();
    }
    
    return {
      count: successCount
    };
  } catch (error) {
    console.error('Error in submitToAnki:', error);
    throw error;
  }
}