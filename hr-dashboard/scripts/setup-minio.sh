#!/bin/bash
# Setup MinIO bucket for HR Dashboard local development
#
# Prerequisites:
#   - MinIO running: docker compose -f docker-compose.dev.yml up -d minio
#   - mc (MinIO Client) installed: brew install minio/stable/mc
#     Or download from: https://min.io/docs/minio/linux/reference/minio-mc.html
#
# Usage:
#   ./scripts/setup-minio.sh

set -euo pipefail

MINIO_URL="${MINIO_URL:-http://localhost:9000}"
MINIO_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_PASS="${MINIO_ROOT_PASSWORD:-minioadmin}"
BUCKET_NAME="${STORAGE_BUCKET:-hr-dashboard}"
ALIAS_NAME="hrdev"

echo "Setting up MinIO for HR Dashboard..."
echo "  MinIO URL: $MINIO_URL"
echo "  Bucket: $BUCKET_NAME"
echo ""

# Check if mc is installed
if ! command -v mc &> /dev/null; then
    echo "MinIO Client (mc) is not installed."
    echo ""
    echo "Install options:"
    echo "  macOS:  brew install minio/stable/mc"
    echo "  Linux:  curl -O https://dl.min.io/client/mc/release/linux-amd64/mc && chmod +x mc && sudo mv mc /usr/local/bin/"
    echo "  Docker: docker run --rm -it --network host minio/mc alias set $ALIAS_NAME $MINIO_URL $MINIO_USER $MINIO_PASS"
    echo ""
    echo "Alternatively, create the bucket manually via MinIO Console: http://localhost:9001"
    exit 1
fi

# Configure mc alias
echo "Configuring MinIO alias '$ALIAS_NAME'..."
mc alias set "$ALIAS_NAME" "$MINIO_URL" "$MINIO_USER" "$MINIO_PASS" --api S3v4 2>/dev/null || true

# Create bucket if it doesn't exist
echo "Creating bucket '$BUCKET_NAME'..."
mc mb "$ALIAS_NAME/$BUCKET_NAME" --ignore-existing

# Set bucket policy to allow authenticated uploads/downloads
# Note: For local development only - in production, use proper IAM policies
echo "Setting bucket policy..."
mc anonymous set download "$ALIAS_NAME/$BUCKET_NAME" 2>/dev/null || echo "  (anonymous access not set - this is OK for signed URLs)"

echo ""
echo "MinIO setup complete!"
echo ""
echo "Your .env should contain:"
echo "  STORAGE_BUCKET=$BUCKET_NAME"
echo "  STORAGE_REGION=us-east-1"
echo "  STORAGE_ENDPOINT=$MINIO_URL"
echo "  AWS_ACCESS_KEY_ID=$MINIO_USER"
echo "  AWS_SECRET_ACCESS_KEY=$MINIO_PASS"
echo ""
echo "MinIO Console: http://localhost:9001 (login: $MINIO_USER / $MINIO_PASS)"
