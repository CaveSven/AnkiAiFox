document.addEventListener('DOMContentLoaded', () => {
  // Make sure loading spinner is hidden on initial load
  showLoading(false);
  
  // Load saved settings
  loadSettings();
  
  // Set up event listeners
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('generateCards').addEventListener('click', generateCards);
  document.getElementById('submitCards').addEventListener('click', submitCardsToAnki);
  
  // Check for existing cards on the current page
  checkExistingCards();
});

// Load settings from storage
function loadSettings() {
  browser.storage.local.get(['apiKey', 'apiAddress', 'deckName', 'noteType', 'modelType']).then(result => {
    document.getElementById('apiKey').value = result.apiKey || '';
    document.getElementById('apiAddress').value = result.apiAddress || 'https://api.openai.com';
    document.getElementById('deckName').value = result.deckName || 'Default';
    document.getElementById('noteType').value = result.noteType || 'Basic';
    
    if (result.modelType) {
      document.getElementById('modelType').value = result.modelType;
    }
  });
}

// Save settings to storage
function saveSettings() {
  const apiKey = document.getElementById('apiKey').value;
  const apiAddress = document.getElementById('apiAddress').value;
  const deckName = document.getElementById('deckName').value;
  const noteType = document.getElementById('noteType').value;
  const modelType = document.getElementById('modelType').value;
  
  browser.storage.local.set({
    apiKey,
    apiAddress,
    deckName,
    noteType,
    modelType
  }).then(() => {
    showStatus('Settings saved!', 'success');
    setTimeout(() => {
      document.getElementById('status').textContent = '';
      document.getElementById('status').className = 'status';
    }, 2000);
  });
}

// Check for existing cards on the current page
async function checkExistingCards() {
  try {
    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    const url = tabs[0].url;
    
    const response = await browser.runtime.sendMessage({
      action: 'getCardsForUrl',
      data: { url }
    });
    
    if (response && response.cards && response.cards.length > 0) {
      displayCardsForReview(response.cards);
    }
  } catch (error) {
    console.error('Error checking existing cards:', error);
  }
}

// Generate Anki cards from current page
async function generateCards() {
  const apiKey = document.getElementById('apiKey').value;
  
  if (!apiKey) {
    showStatus('Please enter an API key', 'error');
    return;
  }
  
  showStatus('Extracting content...', 'info');
  showLoading(true, 'Extracting content from page...');
  
  try {
    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    const url = tabs[0].url;
    
    const response = await browser.tabs.sendMessage(tabs[0].id, {
      action: 'extractContent'
    });
    
    if (response && response.content) {
      processContentWithLLM(response.content, url);
    } else {
      showLoading(false);
      showStatus('Error extracting content', 'error');
    }
  } catch (error) {
    console.error('Error communicating with content script:', error);
    showLoading(false);
    showStatus('Error extracting content', 'error');
  }
}

// Process content with LLM
function processContentWithLLM(content, url) {
  showStatus('Generating cards with LLM...', 'info');
  showLoading(true, 'Processing with LLM. This may take a minute...');
  
  const apiKey = document.getElementById('apiKey').value;
  const apiAddress = document.getElementById('apiAddress').value;
  const modelType = document.getElementById('modelType').value;
  const noteType = document.getElementById('noteType').value;
  
  // Prepare the prompt for the LLM based on note type
  let prompt;
  
  if (noteType.toLowerCase().includes('cloze')) {
    prompt = `
Please analyze the following text and create Anki flashcards with cloze deletions.
For each flashcard:
- Identify key facts, terms, or concepts
- Create a sentence or paragraph with important parts wrapped in cloze deletion format
- Format cloze deletions as: {{cN::text to be hidden}} or {{cN::text to be hidden::optional hint}}
- A single card can have multiple cloze deletions (c1, c2, c3, etc.) to test related concepts
- Include optional hints when it would help recall (e.g., {{c1::Paris::Capital of France}})
- Format your response as a JSON array of objects with "front" property containing the full text with cloze markers
- Example: {"front": "The capital of {{c1::France::Country in Western Europe}} is {{c2::Paris::City on the Seine}}."}

Text to analyze:
${content}
`;
  } else {
    prompt = `
Please analyze the following text and create Anki flashcards with high-quality question-answer pairs.
For each flashcard:
- Create a clear, specific question on the front
- Provide a concise but complete answer on the back
- Focus on important concepts, facts, and relationships
- Format your response as a JSON array of objects with "front" and "back" properties

Text to analyze:
${content}
`;
  }

  // Send to LLM via background script
  browser.runtime.sendMessage({
    action: 'processWithLLM',
    data: {
      prompt,
      apiKey,
      apiAddress,
      model: modelType,
      noteType,
      url
    }
  }).then(response => {
    showLoading(false);
    if (response && response.cards) {
      displayCardsForReview(response.cards);
    } else {
      showStatus('Error generating cards', 'error');
    }
  }).catch(error => {
    console.error('Error processing with LLM:', error);
    showLoading(false);
    showStatus('Error generating cards', 'error');
  });
}

// Display cards for user review
function displayCardsForReview(cards) {
  showStatus('', '');
  
  const cardListElement = document.getElementById('cardList');
  cardListElement.innerHTML = ''; // This is safe as we're clearing the element
  
  // Check if we're using cloze format based on note type
  const noteType = document.getElementById('noteType').value;
  const isClozeFormat = noteType.toLowerCase().includes('cloze');
  
  cards.forEach((card, index) => {
    const cardElement = document.createElement('div');
    cardElement.className = 'card-item';
    cardElement.dataset.index = index;
    
    // Format content appropriately
    let frontContent = card.front;
    let backContent = card.back || '';
    
    // Format cloze deletions if needed
    if (isClozeFormat) {
      frontContent = formatClozeContent(frontContent);
    }
    
    // Create card content container
    const cardContent = document.createElement('div');
    cardContent.className = 'card-content';
    
    // Create card controls container
    const cardControls = document.createElement('div');
    cardControls.className = 'card-controls';
    
    // Create edit fields container
    const editFields = document.createElement('div');
    editFields.className = 'card-edit-fields hidden';
    
    if (isClozeFormat) {
      // For cloze cards, only show the front content with cloze deletions
      const clozeLabel = document.createElement('strong');
      clozeLabel.textContent = 'Cloze Card:';
      
      const contentDiv = document.createElement('div');
      contentDiv.className = 'content';
      contentDiv.innerHTML = frontContent; // This is safe as formatClozeContent returns sanitized HTML
      
      cardContent.appendChild(clozeLabel);
      cardContent.appendChild(contentDiv);
      
      // Create edit textarea
      const editTextarea = document.createElement('textarea');
      editTextarea.className = 'edit-front';
      editTextarea.value = card.front;
      
      // Create save button
      const saveButton = document.createElement('button');
      saveButton.className = 'save-edit';
      saveButton.textContent = 'Save Changes';
      
      editFields.appendChild(editTextarea);
      editFields.appendChild(saveButton);
    } else {
      // For basic cards, show both front and back
      const frontDiv = document.createElement('div');
      frontDiv.className = 'card-front';
      
      const frontLabel = document.createElement('strong');
      frontLabel.textContent = 'Front:';
      
      const frontContentDiv = document.createElement('div');
      frontContentDiv.className = 'content';
      frontContentDiv.textContent = frontContent;
      
      frontDiv.appendChild(frontLabel);
      frontDiv.appendChild(frontContentDiv);
      
      const backDiv = document.createElement('div');
      backDiv.className = 'card-back';
      
      const backLabel = document.createElement('strong');
      backLabel.textContent = 'Back:';
      
      const backContentDiv = document.createElement('div');
      backContentDiv.className = 'content';
      backContentDiv.textContent = backContent;
      
      backDiv.appendChild(backLabel);
      backDiv.appendChild(backContentDiv);
      
      cardContent.appendChild(frontDiv);
      cardContent.appendChild(backDiv);
      
      // Create edit textareas
      const frontTextarea = document.createElement('textarea');
      frontTextarea.className = 'edit-front';
      frontTextarea.value = card.front;
      
      const backTextarea = document.createElement('textarea');
      backTextarea.className = 'edit-back';
      backTextarea.value = card.back || '';
      
      // Create save button
      const saveButton = document.createElement('button');
      saveButton.className = 'save-edit';
      saveButton.textContent = 'Save Changes';
      
      editFields.appendChild(frontTextarea);
      editFields.appendChild(backTextarea);
      editFields.appendChild(saveButton);
    }
    
    // Create control buttons
    const editButton = document.createElement('button');
    editButton.className = 'edit-card';
    editButton.textContent = 'Edit';
    
    const rejectButton = document.createElement('button');
    rejectButton.className = 'reject-card';
    rejectButton.textContent = 'Reject';
    
    cardControls.appendChild(editButton);
    cardControls.appendChild(rejectButton);
    
    // Assemble the card
    cardElement.appendChild(cardContent);
    cardElement.appendChild(cardControls);
    cardElement.appendChild(editFields);
    
    cardListElement.appendChild(cardElement);
  });
  
  // Show the submit button
  document.getElementById('submitCards').classList.remove('hidden');
  
  // Add event listeners for card controls
  document.querySelectorAll('.edit-card').forEach(button => {
    button.addEventListener('click', (e) => {
      const cardItem = e.target.closest('.card-item');
      cardItem.querySelector('.card-edit-fields').classList.toggle('hidden');
    });
  });
  
  document.querySelectorAll('.save-edit').forEach(button => {
    button.addEventListener('click', async (e) => {
      const cardItem = e.target.closest('.card-item');
      const index = parseInt(cardItem.dataset.index);
      
      // Get note type to determine what fields to update
      const noteType = document.getElementById('noteType').value;
      const isClozeFormat = noteType.toLowerCase().includes('cloze');
      
      // Update the card content
      const frontContent = cardItem.querySelector('.edit-front').value;
      const backContent = isClozeFormat ? '' : cardItem.querySelector('.edit-back')?.value || '';
      
      // Format the display content appropriately
      if (isClozeFormat) {
        const displayFrontContent = formatClozeContent(frontContent);
        cardItem.querySelector('.content').innerHTML = displayFrontContent; // This is safe as formatClozeContent returns sanitized HTML
      } else {
        cardItem.querySelector('.card-front .content').textContent = frontContent;
        cardItem.querySelector('.card-back .content').textContent = backContent;
      }
      
      // Get current URL
      const tabs = await browser.tabs.query({active: true, currentWindow: true});
      const url = tabs[0].url;
      
      // Update the original cards array (stored in the background)
      browser.runtime.sendMessage({
        action: 'updateCard',
        data: {
          index,
          card: {
            front: frontContent,
            back: backContent
          },
          url
        }
      });
      
      // Hide edit fields
      cardItem.querySelector('.card-edit-fields').classList.add('hidden');
    });
  });
  
  document.querySelectorAll('.reject-card').forEach(button => {
    button.addEventListener('click', async (e) => {
      const cardItem = e.target.closest('.card-item');
      const index = parseInt(cardItem.dataset.index);
      
      // Get current URL
      const tabs = await browser.tabs.query({active: true, currentWindow: true});
      const url = tabs[0].url;
      
      // Remove the card from view
      cardItem.remove();
      
      // Update the original cards array (stored in the background)
      browser.runtime.sendMessage({
        action: 'rejectCard',
        data: { index, url }
      });
      
      // Hide submit button if no cards remain
      if (document.querySelectorAll('.card-item').length === 0) {
        document.getElementById('submitCards').classList.add('hidden');
      }
    });
  });
}

// Format cloze content with nice styling
function formatClozeContent(content) {
  // Replace cloze deletion patterns with styled spans
  return content.replace(/\{\{c(\d+)::([^}]+?)(?:::([^}]+?))?\}\}/g, (match, num, text, hint) => {
    if (hint) {
      return `<span class="cloze-deletion">c${num}: ${text}<span class="cloze-hint">[${hint}?]</span></span>`;
    } else {
      return `<span class="cloze-deletion">c${num}: ${text}</span>`;
    }
  });
}

// Submit cards to Anki
async function submitCardsToAnki() {
  showStatus('Sending cards to Anki...', 'info');
  showLoading(true, 'Adding cards to Anki...');
  
  const deckName = document.getElementById('deckName').value;
  const noteType = document.getElementById('noteType').value;
  
  // Get current URL
  const tabs = await browser.tabs.query({active: true, currentWindow: true});
  const url = tabs[0].url;
  
  browser.runtime.sendMessage({
    action: 'submitToAnki',
    data: {
      deckName,
      noteType,
      url
    }
  }).then(response => {
    showLoading(false);
    if (response && response.success) {
      showStatus(`${response.count} cards added to Anki!`, 'success');
      
      // Clear the card list
      document.getElementById('cardList').innerHTML = '';
      document.getElementById('submitCards').classList.add('hidden');
    } else {
      showStatus('Error adding cards to Anki', 'error');
    }
  }).catch(error => {
    console.error('Error submitting to Anki:', error);
    showLoading(false);
    showStatus('Error connecting to Anki', 'error');
  });
}

// Show/hide loading spinner
function showLoading(isLoading, message = 'Processing...') {
  const loadingElement = document.getElementById('loading');
  
  if (!loadingElement) return;  // Safety check
  
  if (isLoading) {
    const loadingText = loadingElement.querySelector('.loading-text');
    if (loadingText) {
      loadingText.textContent = message;
    }
    loadingElement.classList.remove('hidden');
  } else {
    loadingElement.classList.add('hidden');
  }
}

// Show status message
function showStatus(message, type) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.className = 'status';
  
  if (type) {
    statusElement.classList.add(type);
  }
} 