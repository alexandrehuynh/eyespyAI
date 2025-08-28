#!/bin/bash

# EyeSpyAI API Test Script
echo "🧪 Testing EyeSpyAI API endpoints..."

BASE_URL="http://localhost:3000"

# Test 1: Health check (should return HTML for React app)
echo "📋 Test 1: Health check"
curl -s "$BASE_URL" | grep -q "root" && echo "✅ Frontend accessible" || echo "❌ Frontend not accessible"

# Test 2: User registration
echo "📋 Test 2: User registration"
REGISTER_RESPONSE=$(curl -s "$BASE_URL/api/auth/register" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"apitest","password":"testpass123","email":"apitest@example.com"}')

if echo "$REGISTER_RESPONSE" | grep -q "success.*true"; then
    echo "✅ User registration successful"
    USER_ID=$(echo "$REGISTER_RESPONSE" | grep -o '"id":[0-9]*' | cut -d: -f2)
else
    echo "❌ User registration failed: $REGISTER_RESPONSE"
fi

# Test 3: User login
echo "📋 Test 3: User login"
LOGIN_RESPONSE=$(curl -s "$BASE_URL/api/auth/login" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"apitest","password":"testpass123"}')

if echo "$LOGIN_RESPONSE" | grep -q "success.*true"; then
    echo "✅ User login successful"
else
    echo "❌ User login failed: $LOGIN_RESPONSE"
fi

echo "🎉 API testing complete!"
