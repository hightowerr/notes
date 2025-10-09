import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({
        success: false,
        error: 'No file provided'
      }, { status: 400 });
    }

    // Upload to Supabase Storage
    const fileName = `test-${Date.now()}-${file.name}`;
    const { data, error } = await supabase
      .storage
      .from('notes')
      .upload(fileName, file);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: 'File uploaded successfully',
      fileName: data.path
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: 'Upload failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
