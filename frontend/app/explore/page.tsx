'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function ExploreRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    router.replace(query ? `/compare?${query}` : '/compare');
  }, [router, searchParams]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#060810] text-[#F0F4FF]">
      <div className="text-sm font-mono text-[var(--accent-cyan)] animate-pulse">
        Directing to SkyTrace Investigation Platform...
      </div>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={null}>
      <ExploreRedirect />
    </Suspense>
  );
}
