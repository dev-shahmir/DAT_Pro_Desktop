# DAT Pro Desktop — macOS Build Instructions

### 1. Requirements
- macOS (Intel or Apple Silicon M1/M2/M3/M4)
- Node.js (v18, v20, or v22 recommended)

### 2. Install Dependencies
Terminal open karein is project folder ke andar aur run karein:
```bash
npm install
```

### 3. Run Development / Preview
Test karne ke liye app ko run karein:
```bash
# Development mode (Hot reload):
npm run dev

# Ya Production preview (Direct built version):
npm run preview
```

### 4. Build Standalone Mac DMG Installer
Mac ke liye `.dmg` installer package banane ke liye run karein:
```bash
npm run dist:mac
```

Build complete hone ke baad `.dmg` installer file **`release/`** folder ke andar ban jayegi:
- `DAT Pro-3.2.0-arm64.dmg` (Apple Silicon Mac ke liye)
- `DAT Pro-3.2.0-x64.dmg` (Intel Mac ke liye)
