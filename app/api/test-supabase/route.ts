import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // Test connection by listing storage buckets
    const { data: buckets, error } = await supabase
      .storage
      .listBuckets();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: 'Supabase connection successful',
      bucketsFound: buckets?.length || 0,
      buckets: buckets?.map(b => b.name) || []
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: 'Supabase connection failed',
      error: error.message || 'Unknown error'
    }, { status: 500 });
  }
}
