# UltraSkelly

**UltraSkelly** is a web-based Bluetooth Low Energy (BLE) controller for animated skeleton devices. Control your Skelly skeleton animatronics directly from your web browser - no mobile app required!

![UltraSkelly Interface](https://via.placeholder.com/800x400?text=UltraSkelly+Interface)

## Features

### Device Communication
- **Bluetooth Connectivity**: Connect/disconnect from Skelly devices via Web Bluetooth API
- **Device Queries**: Get device info including version, storage capacity, settings, volume, and more
- **Real-time Logging**: Monitor all BLE communications in real-time
- **Raw Commands**: Send custom commands for debugging and advanced control

### Media Management
- **File Upload**: Upload MP3 audio files directly to your device
- **Audio Conversion**: Automatically convert audio to device-compatible format (8kHz mono MP3)
- **Playback Control**: Play/pause audio files and adjust volume (0-100%)
- **File Management**: View, filter, play, edit metadata, and delete files
- **Smart Transfer**: Chunked file transfer protocol with resume capability for interrupted uploads

### Real-Time Appearance Control
- **Movement Control**: Toggle head, arms, torso animations (individual or all-at-once)
- **RGB Lighting**: Full color control with color picker and preset colors
- **Lighting Effects**: Static, Strobe, and Pulsing modes with speed control
- **Brightness**: Adjustable brightness (0-255)
- **Eye Icons**: Choose from 18 different eye icon options
- **Color Cycling**: Animate through all colors automatically

### Per-File Editing
- **Animation Actions**: Set movement behavior codes (0-255) for each file
- **Lighting Metadata**: Configure per-file lighting modes, colors, and speeds
- **Eye Icons**: Assign specific eye icons to individual files
- **File Replacement**: Upload new versions while keeping metadata
- **Batch Operations**: Delete and manage multiple files

## Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Communication**: Web Bluetooth API (GATT)
- **Audio Processing**: Web Audio API + lamejs (MP3 encoding)
- **Storage**: localStorage for user preferences
- **Hosting**: GitHub Pages with Jekyll
- **Protocol**: Custom binary protocol with CRC8 checksums

## Browser Compatibility

UltraSkelly requires the Web Bluetooth API, which is available in:
- ✅ Chrome/Chromium (desktop and Android)
- ✅ Edge (desktop and Android)
- ❌ Firefox (not supported)
- ❌ Safari (not supported)
- ❌ iOS browsers (not supported due to Apple restrictions)

**Note**: HTTPS is required for Web Bluetooth functionality.

## How to Run

### Option 1: Use the Live Hosted Version (Recommended)

Simply visit the hosted version on GitHub Pages:

```
https://[your-github-username].github.io/UltraSkelly/
```

No installation required! Just open in a compatible browser and start connecting to your devices.

### Option 2: Run Locally with Jekyll

1. **Prerequisites**
   ```bash
   # Install Ruby (if not already installed)
   # On macOS with Homebrew:
   brew install ruby

   # Install Jekyll and Bundler
   gem install jekyll bundler
   ```

2. **Clone the Repository**
   ```bash
   git clone https://github.com/[your-username]/UltraSkelly.git
   cd UltraSkelly
   ```

3. **Install Dependencies**
   ```bash
   bundle install
   ```

4. **Run the Development Server**
   ```bash
   bundle exec jekyll serve
   ```

5. **Access the Application**

   Open your browser to: `http://localhost:4000`

### Option 3: Run with Any HTTP Server

Since this is a static site, you can use any HTTP server:

**Python 3:**
```bash
python3 -m http.server 8000
```

**Node.js (http-server):**
```bash
npx http-server -p 8000
```

**PHP:**
```bash
php -S localhost:8000
```

Then visit: `http://localhost:8000`

**⚠️ Important**: Web Bluetooth requires HTTPS in production. For local development, `localhost` is treated as a secure context, but deploying to a non-HTTPS host will not work.

## Usage Guide

### Getting Started

1. **Connect to Device**
   - Click "Connect to Device" button
   - Select your Skelly device from the browser's Bluetooth picker
   - Device name will appear when connected

2. **Query Device Information**
   - Click query buttons (E0, E1, E5, E6, EE, D2) to get device details
   - View results in the Status panel and Communication Log

3. **Upload Audio Files**
   - Click "Choose File" in the Media panel
   - Select an MP3 file (conversion available for other formats)
   - Optionally convert to device-optimized format (8kHz mono)
   - Confirm upload (transfers may take several minutes)

4. **Control Appearance in Real-Time**
   - Use the Appearance controls to adjust lighting, movement, and eye icons
   - Changes apply immediately without uploading files
   - Select target channel or "All" for synchronized control

5. **Manage Files**
   - View uploaded files in the Files panel
   - Click "Play" to play a file on the device
   - Click "Edit" to modify file metadata, lighting, and animation settings
   - Use filter to search by filename

### Advanced Features

- **Raw Commands**: Enable "Show Raw Command Send" in Advanced to send custom hex commands
- **Communication Log**: Monitor all BLE traffic with optional filtering
- **Edit Mode**: Modify per-file settings including eye icons, animations, lighting, and colors

## Architecture Overview

### File Structure
```
UltraSkelly/
├── index.html          # Main application (SPA)
├── _config.yml         # Jekyll configuration
├── README.md           # This file
└── assets/             # (if any images/resources)
```

### BLE Communication Protocol

- **Message Format**: `AA` (start) + `TAG` (1-2 bytes) + `Payload` (≤8 bytes) + `CRC8`
- **Command Categories**:
  - **E-series**: Device queries (E0, E1, E5, E6, EE)
  - **F-series**: Control commands (play, volume, movement, lighting)
  - **C-series**: File transfer (C0-C4)
  - **D-series**: Storage queries (D2)

### State Management

Global objects track application state:
- `status`: Device parameters and capabilities
- `files`: File list model
- `transfer`: File transfer state machine
- BLE connection objects: `device`, `server`, `service`, `writeChar`, `notifyChar`

### Data Flow Example: File Upload

1. User selects file → Duration check → Warning (if >30s)
2. Optional audio conversion with progress feedback
3. User confirms upload warning
4. Transfer state machine executes:
   - **C0**: Start transfer (size, chunks, filename)
   - **C1**: Send data chunks (500 bytes each)
   - **C2**: End transfer
   - **C3**: Commit/rename file
5. Refresh file list and log completion

## Development

### Making Changes

1. Edit `index.html` for all application logic and UI
2. Test locally using Jekyll or any HTTP server
3. Commit and push to GitHub
4. GitHub Pages will automatically deploy changes

### Adding Features

The codebase uses vanilla JavaScript with no build process:
- **UI Components**: Defined directly in HTML
- **State Management**: Global objects and event handlers
- **BLE Logic**: Functions in `<script>` tags within index.html

### Debugging

- Enable "Show Raw Command Send" for command inspection
- Use the Communication Log to monitor BLE traffic
- Check browser console for Web Bluetooth errors
- Toggle "Show FEDC (keepalive)" to reduce log noise

## Safety & Warnings

- ⚠️ **Experimental Features**: File editing and long audio uploads are experimental
- ⚠️ **Transfer Times**: File uploads can take several minutes depending on file size
- ⚠️ **Device Compatibility**: Designed for specific Skelly skeleton devices with custom firmware
- ⚠️ **Audio Length**: Files >30 seconds may cause device performance issues

## Contributing

Contributions are welcome! Feel free to:
- Report bugs via GitHub Issues
- Submit pull requests for bug fixes or features
- Improve documentation
- Share device compatibility information

## License

[Specify your license here - e.g., MIT, GPL, etc.]

## Acknowledgments

- **lamejs**: MP3 encoding library
- **Web Bluetooth Community**: For browser API development
- **Skelly Device Community**: For protocol reverse engineering

## Support

For issues, questions, or feature requests:
- Open an issue on GitHub
- Check the Communication Log for BLE errors
- Ensure your browser supports Web Bluetooth
- Verify device is in pairing mode and within range

---

**Built with ❤️ for the Skelly community**
