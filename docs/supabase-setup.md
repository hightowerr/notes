# Supabase Setup Guide

## Storage Bucket Setup

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to your Supabase project: https://emgvqqqqdbfpjwbouybj.supabase.co
2. Navigate to **Storage** in the left sidebar
3. Click **"New bucket"**
4. Configure:
   - **Name:** `notes`
   - **Public bucket:** OFF (unchecked)
   - **File size limit:** 50 MB
   - **Allowed MIME types:** `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain`
5. Click **"Create bucket"**

### Option 2: Disable RLS Temporarily (Development Only)

Run this SQL in Supabase SQL Editor:

```sql
-- Allow service role to bypass RLS
ALTER TABLE storage.buckets DISABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;
```

**Warning:** This disables security. Only use for local development.

### Option 3: Add Proper RLS Policies

Run this SQL in Supabase SQL Editor:

```sql
-- Enable RLS
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to upload
CREATE POLICY "Allow uploads to notes bucket"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'notes');

-- Allow authenticated users to read
CREATE POLICY "Allow reads from notes bucket"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'notes');

-- Allow service role full access
CREATE POLICY "Service role has full access"
ON storage.objects
TO service_role
USING (true)
WITH CHECK (true);
```

## Environment Variables

Ensure `.env.local` has:

```
NEXT_PUBLIC_SUPABASE_URL=https://emgvqqqqdbfpjwbouybj.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # For server-side operations
```

**Note:** For server-side file operations, you need the **service role key** (not the publishable key).

## Testing After Setup

```bash
curl -X POST http://localhost:3000/api/setup-storage
```

Should return:
```json
{"success":true,"message":"Storage bucket created successfully","bucketName":"notes"}
```
