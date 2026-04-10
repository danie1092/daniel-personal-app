import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token || token !== process.env.COLLECT_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const body = await request.json()
    const { url, memo, source = 'instagram' } = body

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const userId = process.env.DEFAULT_USER_ID!

    const { data: existing } = await supabase
      .from('collected_items')
      .select('id')
      .eq('user_id', userId)
      .eq('url', url)
      .single()

    if (existing) {
      return NextResponse.json({
        message: 'Already collected',
        duplicate: true
      }, { status: 200 })
    }

    const { data, error } = await supabase
      .from('collected_items')
      .insert({
        user_id: userId,
        url,
        memo: memo || null,
        source,
        is_processed: false
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data }, { status: 201 })

  } catch (error) {
    console.error('Collect API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
