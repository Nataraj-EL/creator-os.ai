import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Define route filters
  const isDashboardRoute = pathname.startsWith('/dashboard');
  const isAuthRoute = pathname === '/login' || pathname === '/register' || pathname === '/forgot-password';

  // Retrieve cookie
  const isAuthenticated = request.cookies.has('creatoros-auth-token');

  if (isDashboardRoute && !isAuthenticated) {
    // Redirect unauthenticated access of dashboard routes to login page
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && isAuthenticated) {
    // Redirect authenticated users trying to access login/register back to dashboard
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/login', '/register', '/forgot-password'],
};
