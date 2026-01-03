# Instagram Follower Checker - Edge Extension

A Microsoft Edge browser extension to analyze your Instagram followers and find out who doesn't follow you back.

## Features

- 📊 **Analyze Followers/Following**: Scan your Instagram account to get complete lists
- ❌ **Not Following Back**: See who you follow but doesn't follow you back
- 💜 **Fans**: See who follows you but you don't follow back
- 🔍 **Search**: Filter through your lists easily
- 📥 **Export**: Download reports as text files
- 💾 **Cached Data**: Results are saved for quick access

## Installation

### Method 1: Load Unpacked Extension (Developer Mode)

1. Open Microsoft Edge
2. Go to `edge://extensions/`
3. Enable **Developer mode** (toggle in the bottom-left or top-right)
4. Click **Load unpacked**
5. Select the `edge-extension` folder
6. The extension icon should appear in your toolbar

### Method 2: Create Icons First

Before loading, you may want to convert the SVG icon to PNG format:

```bash
# If you have ImageMagick installed:
cd edge-extension/icons
convert -background none icon.svg -resize 16x16 icon16.png
convert -background none icon.svg -resize 48x48 icon48.png
convert -background none icon.svg -resize 128x128 icon128.png
```

Or simply use any online SVG to PNG converter with sizes: 16x16, 48x48, 128x128

## Usage

1. **Open Instagram**: Go to https://www.instagram.com and log in
2. **Navigate to Your Profile**: Click on your profile picture or go to `instagram.com/yourusername`
3. **Click the Extension Icon**: In your browser toolbar
4. **Click "Analyze Followers"**: The extension will start scanning
5. **Wait for Results**: This may take a few minutes depending on your follower/following count
6. **View Results**: 
   - Switch between "Not Following Back" and "Fans" tabs
   - Search for specific users
   - Export lists as text files

## How It Works

The extension:
1. Fetches your followers list from Instagram's API
2. Fetches your following list
3. Compares both lists to identify:
   - Users you follow who don't follow you back
   - Users who follow you but you don't follow back

## Notes

- ⚠️ **Rate Limiting**: Instagram may rate-limit requests. If this happens, wait a few minutes and try again.
- 🔒 **Privacy**: All data is processed locally. Nothing is sent to external servers.
- 📱 **Login Required**: You must be logged into Instagram in your browser.
- ⏱️ **Large Accounts**: Accounts with many followers may take longer to analyze.

## Troubleshooting

### "Could not detect Instagram username"
- Make sure you're on your Instagram profile page (instagram.com/yourusername)
- Try refreshing the page and waiting a few seconds

### "Rate limited by Instagram"
- Wait 5-10 minutes before trying again
- Instagram limits API requests to prevent abuse

### Extension not working
- Make sure you're logged into Instagram
- Try clearing extension data and analyzing again
- Check the browser console for errors (F12 → Console)

## Files Structure

```
edge-extension/
├── manifest.json      # Extension configuration
├── popup.html         # Extension popup UI
├── popup.css          # Popup styles
├── popup.js           # Popup functionality
├── content.js         # Instagram page interaction
├── content.css        # Page injection styles
├── icons/
│   ├── icon.svg       # Source icon
│   ├── icon16.png     # 16x16 icon
│   ├── icon48.png     # 48x48 icon
│   └── icon128.png    # 128x128 icon
└── README.md          # This file
```

## Disclaimer

This extension is for personal use only. Use responsibly and respect Instagram's Terms of Service.
