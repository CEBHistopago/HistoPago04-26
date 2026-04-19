'use client';

import { useState, useEffect } from 'react';
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  CollectionReference,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/** Utility type to add an 'id' field to a given type T. */
export type WithId<T> = T & { id: string };

/**
 * Interface for the return value of the useCollection hook.
 * @template T Type of the document data.
 */
export interface UseCollectionResult<T> {
  data: WithId<T>[] | null; // Document data with ID, or null.
  isLoading: boolean;       // True if loading.
  error: FirestoreError | Error | null; // Error object, or null.
}

/* Internal implementation of Query:
  https://github.com/firebase/firebase-js-sdk/blob/c5f08a9bc5da0d2b0207802c972d53724ccef055/packages/firestore/src/lite-api/reference.ts#L143
*/
export interface InternalQuery extends Query<DocumentData> {
  _query: {
    path: {
      canonicalString(): string;
      toString(): string;
    }
  }
}

/**
 * React hook to subscribe to a Firestore collection or query in real-time.
 * Handles nullable references/queries.
 * 
 *
 * IMPORTANT! YOU MUST MEMOIZE the inputted memoizedTargetRefOrQuery or BAD THINGS WILL HAPPEN
 * use useMemo to memoize it per React guidence.  Also make sure that it's dependencies are stable
 * references
 *  
 * @template T Optional type for document data. Defaults to any.
 * @param {CollectionReference<DocumentData> | Query<DocumentData> | null | undefined} targetRefOrQuery -
 * The Firestore CollectionReference or Query. Waits if null/undefined.
 * @returns {UseCollectionResult<T>} Object with data, isLoading, error.
 */
export function useCollection<T = any>(
    memoizedTargetRefOrQuery: ((CollectionReference<DocumentData> | Query<DocumentData>) & {__memo?: boolean})  | null | undefined,
): UseCollectionResult<T> {
  type ResultItemType = WithId<T>;
  type StateDataType = ResultItemType[] | null;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start as true
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    if (!memoizedTargetRefOrQuery) {
      setData(null);
      // When the query is null, it's not "loading" in the traditional sense,
      // it's just waiting for a valid query. Setting isLoading to true
      // here can cause unnecessary loading spinners. The parent component
      // can decide what to render based on the query being null.
      setIsLoading(false);
      setError(null);
      return;
    }
    
    // Only set loading to true when we have a valid query and are about to fetch.
    setIsLoading(true);
    setError(null);

    // Directly use memoizedTargetRefOrQuery as it's assumed to be the final query
    const unsubscribe = onSnapshot(
      memoizedTargetRefOrQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const results: ResultItemType[] = [];
        for (const doc of snapshot.docs) {
          results.push({ ...(doc.data() as T), id: doc.id });
        }
        setData(results);
        setError(null);
        setIsLoading(false);
      },
      (error: FirestoreError) => {
        // This logic extracts the path from a ref, query, or collection group
        let path = 'unknown_path';
        try {
          if ('path' in memoizedTargetRefOrQuery && typeof memoizedTargetRefOrQuery.path === 'string') {
             // Handle CollectionReference
             path = (memoizedTargetRefOrQuery as CollectionReference).path;
          } else if ('_query' in memoizedTargetRefOrQuery && (memoizedTargetRefOrQuery as any)._query?.path) {
             // Handle Query
             path = (memoizedTargetRefOrQuery as any)._query.path.canonicalString();
          } else {
             // Fallback for collection group queries which don't have a simple path
             path = `collection_group<${(memoizedTargetRefOrQuery as any)._query.collectionGroup}>`;
          }
        } catch (e) {
            // Do not log this error, as it's a fallback mechanism.
        }

        const contextualError = new FirestorePermissionError({
          operation: 'list',
          path,
        })

        setError(contextualError)
        setData(null)
        setIsLoading(false)

        // trigger global error propagation
        errorEmitter.emit('permission-error', contextualError);
      }
    );

    return () => unsubscribe();
  }, [memoizedTargetRefOrQuery]); // Re-run if the target query/reference changes.
  
  if (memoizedTargetRefOrQuery && (memoizedTargetRefOrQuery as any).__memo !== true && process.env.NODE_ENV === 'development') {
    // This provides a clear developer-time warning without crashing production.
    console.warn('The query passed to useCollection was not created with useMemoFirebase. This can lead to performance issues and infinite loops.', memoizedTargetRefOrQuery);
  }

  return { data, isLoading, error };
}
