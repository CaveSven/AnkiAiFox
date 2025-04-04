// Listen for messages from the popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'extractContent') {
    sendResponse({ content: extractPageContent() });
    return true;
  }
});

// Extract content from the current webpage
function extractPageContent() {
  try {
    // Get the page title
    const title = document.title;
    
    // Get the article content if available
    let articleContent = '';
    const articleElements = document.querySelectorAll('article, [role="article"], .article, .post, .post-content, .entry-content, main');
    
    if (articleElements.length > 0) {
      // Use the first article element found
      articleContent = articleElements[0].innerText;
    } else {
      // Fallback to main content extraction
      const bodyContent = document.body.innerText;
      
      // Remove common noise elements
      const noiseElements = document.querySelectorAll('nav, header, footer, aside, .ads, .comments, .sidebar, .menu, .navigation, script, style');
      let noiseContent = '';
      noiseElements.forEach(element => {
        noiseContent += element.innerText + ' ';
      });
      
      // Try to extract meaningful content
      articleContent = bodyContent.replace(noiseContent, '').trim();
    }
    
    // Limit content length if too large (LLM context window limitation)
    const maxLength = 1e9;
    if (articleContent.length > maxLength) {
      articleContent = articleContent.substring(0, maxLength) + 
        "\n\n[Content truncated due to length limitations. This is only a portion of the full article.]";
    }
    
    // Combine title and content
    return `Title: ${title}\n\nContent:\n${articleContent}`;
  } catch (error) {
    console.error('Error extracting content:', error);
    return 'Error extracting content from page.';
  }
} 