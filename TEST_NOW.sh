#!/bin/bash

# Dashboard Testing Script
# Quick start script to test the dashboard locally

echo "🚀 Starting Dashboard Test Environment..."
echo ""

# Check if we're in the right directory
if [ ! -d "dashboard" ]; then
    echo "❌ Error: dashboard directory not found"
    echo "   Please run this script from the repository root:"
    echo "   cd /Users/franciscocoelho/code/certoma/registo-horas"
    exit 1
fi

echo "✅ Found dashboard directory"
echo ""

# Check for backend server
echo "📡 Checking backend..."
if curl -s http://localhost:8787/health > /dev/null 2>&1; then
    echo "✅ Backend is running at http://localhost:8787"
else
    echo "⚠️  Backend is NOT running"
    echo "   To start backend (optional for testing with real data):"
    echo "   cd server && npm install && npm start"
    echo ""
    echo "   Dashboard will use production backend instead."
fi

echo ""
echo "🌐 Starting frontend server..."
echo ""

# Check if npx is available
if ! command -v npx &> /dev/null; then
    echo "❌ npx not found. Installing Node.js is required."
    exit 1
fi

echo "📦 Using npx http-server..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Dashboard will be available at:"
echo "  👉 http://localhost:8080/dashboard/"
echo ""
echo "  Login credentials:"
echo "  👤 Username: certoma"
echo "  🔑 Password: certomaSRP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Press CTRL+C to stop the server"
echo ""

# Start the server
npx http-server . -p 8080
