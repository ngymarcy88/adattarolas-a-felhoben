#!/bin/sh
set -eu

# Do not enable xtrace: the arguments below include local credentials.
mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
mc mb --ignore-existing "local/$S3_BUCKET" >/dev/null
mc anonymous set none "local/$S3_BUCKET" >/dev/null
printf '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:GetBucketLocation","s3:ListBucket"],"Resource":["arn:aws:s3:::%s"]},{"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":["arn:aws:s3:::%s/*"]}]}' "$S3_BUCKET" "$S3_BUCKET" > /tmp/application-policy.json
mc admin user add local "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
mc admin policy create local cloudvault-app /tmp/application-policy.json >/dev/null
mc admin policy attach local cloudvault-app --user "$S3_ACCESS_KEY_ID" >/dev/null
printf 'Private bucket and bucket-scoped application identity are ready.\n'
