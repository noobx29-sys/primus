#!/bin/bash

echo "=================================================="
echo "🤖 AI Trading Analyzer - Setup Script"
echo "=================================================="
echo ""

# Check Node.js version
echo "Checking Node.js version..."
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)

if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Error: Node.js 18+ required. Current version: $(node -v)"
    exit 1
fi

echo "✓ Node.js version: $(node -v)"
echo ""

# Install dependencies
echo "Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✓ Dependencies installed"
echo ""

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "✓ .env file created"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env and add your OPENAI_API_KEY"
    echo ""
else
    echo "✓ .env file already exists"
    echo ""
fi

# Create output directories
echo "Creating output directories..."
mkdir -p output/raw
mkdir -p reports
mkdir -p logs

echo "✓ Directories created"
echo ""

# Run tests
echo "Running tests..."
npm test

if [ $? -ne 0 ]; then
    echo "⚠️  Some tests failed, but setup is complete"
else
    echo "✓ All tests passed"
fi

echo ""
echo "=================================================="
echo "✅ Setup Complete!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "1. Edit .env and add your OPENAI_API_KEY"
echo "2. Configure trading pairs and strategies in .env"
echo "3. Run: npm start"
echo ""
echo "Usage examples:"
echo "  npm start                          # Analyze all pairs"
echo "  node src/index.js --pair XAUUSD    # Analyze specific pair"
echo "  node src/index.js --strategy swing # Analyze with swing strategy"
echo ""
echo "For help: node src/index.js --help"
echo "=================================================="
