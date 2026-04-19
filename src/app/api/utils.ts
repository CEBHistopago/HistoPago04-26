import { initializeFirebaseAdmin } from '@/firebase/server';
import type { Vendor } from '@/lib/data';

/**
 * Finds a vendor by their API key.
 * @param apiKey The API key to search for.
 * @returns The vendor data or null if not found.
 */
export async function findVendorByApiKey(apiKey: string): Promise<Vendor | null> {
    if (!apiKey) {
        return null;
    }
    const { firestore } = await initializeFirebaseAdmin();
    const vendorsRef = firestore.collection('vendors');
    const query = vendorsRef.where('apiKey', '==', apiKey).limit(1);
    const snapshot = await query.get();

    if (snapshot.empty) {
        return null;
    }

    const vendorDoc = snapshot.docs[0];
    return { id: vendorDoc.id, ...vendorDoc.data() } as Vendor;
}
