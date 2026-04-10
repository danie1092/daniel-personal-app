import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { url, memo, source = 'instagram' } = body

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('collected_items')
      .select('id')
      .eq('user_id', user.id)
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
        user_id: user.id,
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
