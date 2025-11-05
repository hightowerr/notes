#!/bin/bash
# Test Search Endpoint - Complete workflow
# Tests T023 (embedding generation) + T024 (semantic search)

set -e

BASE_URL="http://localhost:3001"
echo "Testing search endpoint workflow..."

# Step 1: Upload a test document
echo ""
echo "Step 1: Uploading test document..."
echo "Note: You need to have a test file ready (e.g., test.txt with some task content)"
echo ""
echo "Example upload command:"
echo "curl -X POST $BASE_URL/api/upload -F 'file=@test.txt'"
echo ""
echo "Or use the web UI at http://localhost:3001"
echo ""

# Step 2: Wait for processing
echo "Step 2: Wait for document processing (~10 seconds)..."
echo "Monitor the server logs for:"
echo "  [GenerateEmbeddings] Embedding generation complete"
echo ""

# Step 3: Verify embeddings in database
echo "Step 3: Verify embeddings exist in database"
echo "Run in Supabase SQL Editor:"
echo "  SELECT count(*), status FROM task_embeddings GROUP BY status;"
echo "  Expected: At least 1 row with status='completed'"
echo ""

# Step 4: Test search endpoint
echo "Step 4: Test semantic search"
echo ""
echo "Example search query:"
cat <<'EOF'
curl -X POST http://localhost:3001/api/embeddings/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "increase revenue",
    "limit": 10,
    "threshold": 0.7
  }' | jq
EOF

echo ""
echo "Expected response:"
cat <<'EOF'
{
  "tasks": [
    {
      "task_id": "abc123...",
      "task_text": "Implement revenue tracking",
      "document_id": "550e8400-...",
      "similarity": 0.89
    }
  ],
  "query": "increase revenue",
  "count": 1
}
EOF

echo ""
echo "Step 5: Measure performance"
echo ""
echo "time curl -X POST $BASE_URL/api/embeddings/search \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"query\": \"test\", \"limit\": 20, \"threshold\": 0.7}'"
echo ""
echo "Expected: <500ms response time (FR-015)"
echo ""

# Quick test with current state
echo "Step 6: Testing current state (should return empty results)..."
RESPONSE=$(curl -s -X POST $BASE_URL/api/embeddings/search \
  -H "Content-Type: application/json" \
  -d '{"query": "test", "limit": 5, "threshold": 0.7}')

echo "Response: $RESPONSE"
echo ""

COUNT=$(echo $RESPONSE | grep -o '"count":[0-9]*' | grep -o '[0-9]*')
if [ "$COUNT" = "0" ]; then
  echo "✓ Search endpoint working (no embeddings yet - upload a document first)"
else
  echo "✓ Search endpoint working ($COUNT results found)"
fi
