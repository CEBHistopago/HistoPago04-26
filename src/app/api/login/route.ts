import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/firebase/server';

export async function POST(request: Request) {
  try {
    const { adminApp } = await initializeFirebaseAdmin();
    const firestore = getFirestore(adminApp);
    const auth = getAuth(adminApp);

    const idToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!idToken) {
      return NextResponse.json(
        { message: 'Authorization header missing' },
        { status: 401 }
      );
    }

    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    let userRole: 'admin' | 'vendor' | 'customer' | null = null;
    let userData: any = null;

    console.log(`[LOGIN_API] Procesando inicio de sesión para UID: ${uid}`);

    // 1. Verificar Rol de Administrador
    const adminDoc = await firestore.collection('admins').doc(uid).get();
    if (adminDoc.exists) {
      userRole = 'admin';
      userData = adminDoc.data();
    }

    // 2. Verificar Rol de Cliente
    if (!userRole) {
        const customerDoc = await firestore.collection('customers').doc(uid).get();
        if (customerDoc.exists) {
            userRole = 'customer';
            userData = customerDoc.data();
        }
    }

    // 3. Verificar Rol de Comercio (Vendor)
    if (!userRole) {
        const vendorDoc = await firestore.collection('vendors').doc(uid).get();
        if (vendorDoc.exists) {
            userRole = 'vendor';
            userData = vendorDoc.data();
        }
    }

    if (!userRole) {
        console.warn(`[LOGIN_API] Usuario ${uid} autenticado en Auth pero no encontrado en colecciones de Firestore.`);
        return NextResponse.json({ message: 'Perfil de usuario no encontrado. Por favor, regístrate de nuevo.' }, { status: 403 });
    }
    
    // Validaciones específicas para Comercios
    if (userRole === 'vendor' && userData) {
        // BLOQUEO TOTAL: Solo para cuentas suspendidas manualmente por el administrador.
        if (userData.status === 'Suspendido') {
            console.log(`[LOGIN_API] Acceso denegado: Comercio ${uid} está SUSPENDIDO.`);
            return NextResponse.json(
                { message: 'Su cuenta ha sido Suspendida por el Administrador. Por favor, contacte a soporte técnico para más información.' },
                { status: 403 }
            );
        }

        // CONTROL DE VENCIMIENTO AUTOMÁTICO (RESILIENTE)
        if (userData.subscriptionEndDate && userData.subscriptionEndDate instanceof Timestamp) {
            const today = new Date();
            const endDate = userData.subscriptionEndDate.toDate();
            
            if (endDate < today && userData.status === 'Activo') {
                console.log(`[LOGIN_API] Detectada suscripción vencida para ${uid}. Intentando actualizar a Inactivo de forma resiliente...`);
                // Envolvemos en try-catch para que si la base de datos falla, el login NO se detenga.
                try {
                    await firestore.collection('vendors').doc(uid).update({ status: 'Inactivo' });
                } catch (e) {
                    console.error(`[LOGIN_API] Error al actualizar estado a Inactivo (no crítico):`, e);
                }
            }
        }
    }
    
    // Crear sesión de Firebase (Session Cookie)
    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 días
    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

    const cookieStore = cookies();
    cookieStore.set('session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: expiresIn,
      path: '/',
    });

    cookieStore.set('userRole', userRole, {
        maxAge: expiresIn,
        path: '/',
    });

    console.log(`[LOGIN_API] Sesión creada exitosamente para ${uid} con rol ${userRole}.`);
    return NextResponse.json({ status: 'success', role: userRole });

  } catch (error: any) {
    console.error('[LOGIN_API] Error Crítico:', error);
    return NextResponse.json(
      { message: error.message || 'Error interno del servidor al procesar el acceso.' },
      { status: 400 }
    );
  }
}
