import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST() {
  try {
    // Create a bucket for note files
    const { data, error } = await supabase
      .storage
      .createBucket('notes', {
        public: false,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain'
        ]
      });

    if (error) {
      // Check if bucket already exists
      if (error.message.includes('already exists')) {
        return NextResponse.json({
          success: true,
          message: 'Storage bucket already exists',
          bucketName: 'notes'
        });
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: 'Storage bucket created successfully',
      bucketName: data.name
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: 'Failed to create storage bucket',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
