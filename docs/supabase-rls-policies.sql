-- Run this in Supabase SQL Editor
-- (Project Dashboard -> SQL Editor -> New Query)

-- Allow public uploads to notes bucket (for testing)
CREATE POLICY "Allow public uploads to notes"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'notes');

-- Allow public reads from notes bucket
CREATE POLICY "Allow public reads from notes"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'notes');

-- Allow public updates (optional)
CREATE POLICY "Allow public updates to notes"
ON storage.objects
FOR UPDATE
TO public
USING (bucket_id = 'notes')
WITH CHECK (bucket_id = 'notes');

-- Allow public deletes (optional)
CREATE POLICY "Allow public deletes from notes"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'notes');
