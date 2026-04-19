import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
    try {
        // Clear the session cookie
        cookies().delete('session');
        
        return new NextResponse('Session cookie cleared', { status: 200 });
    } catch (error) {
        console.error('Session Logout Error:', error);
        return new NextResponse('Failed to clear session', { status: 400 });
    }
}
