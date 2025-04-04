# AnkiAiFox

A Firefox extension that helps you create Anki flashcards from web content using an LLM. Built with [cursor](https://www.cursor.com/).

## Features

- Extract content from any webpage
- Generate Anki flashcards using a Large Language Model
- Review and edit card suggestions before adding them to Anki
- Directly add approved cards to your Anki collection via AnkiConnect

## Requirements

1. [Firefox Browser](https://www.mozilla.org/en-US/firefox/new/)
2. [Anki](https://apps.ankiweb.net/) desktop application
3. [AnkiConnect](https://ankiweb.net/shared/info/2055492159) add-on for Anki
4. An API key for an LLM provider

## Installation

### 1. Install AnkiConnect
1. Open Anki
2. Go to Tools > Add-ons > Get Add-ons
3. Enter the code `2055492159`
4. Restart Anki

### 2. Install AnkiAiFox (Temporary Installation)

1. Download this repository
2. Open Firefox
3. Enter `about:debugging` in the address bar
4. Click "This Firefox"
5. Click "Load Temporary Add-on"
6. Select the `manifest.json` file from the downloaded repository

## Usage

1. Make sure Anki is running with AnkiConnect installed
2. Navigate to a webpage you want to create flashcards from
3. Click the AnkiAiFox icon in your toolbar
4. Enter your LLM API key and configure your preferences
5. Click "Generate Cards from Current Page"
6. Review the suggested cards - you can edit or reject any cards
7. Click "Add to Anki" to send the approved cards to your Anki collection


## Configuration

- **LLM API Key**: Your API key
- **API Address**: Host to LLM Provider
- **Anki Deck**: The name of the deck where cards will be added (must exist in Anki)
- **Note Type**: Select "Basic" or "Cloze".
- **LLM Model**: Select between different models

![ankiaifox.png](ankiaifox_menu.png)

## Privacy Notice

Your API key is stored locally and is only used to communicate with the OpenAI API. Web content is sent to the OpenAI API for processing. Please review your model provider's privacy policy for information on how they handle your data.

## License

MIT License 

## TODO
* Images.