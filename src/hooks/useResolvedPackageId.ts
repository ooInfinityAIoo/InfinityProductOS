// WHY THIS FILE EXISTS:
// Almost every studio needs the active package's *ID*, but the global store only
// holds the active package's *name* (activeProductContext). So ~11 studios each
// independently: (1) fetched /masters/packages, (2) .find()'d the package whose
// package_name matches activeProductContext, (3) read .package_id. That duplication
// is exactly where the "empty studio" bug class came from — one studio using a
// stale/0-arg query key, another forgetting the null-guard, another matching on the
// wrong field. Centralizing it means the name→id resolution is written and fixed
// once.
//
// queryKey is intentionally ['product-packages'] — the SAME key the package-creation
// flows invalidate (ProductPackageWizard / HomeDashboard), so creating a new package
// still refreshes every studio that resolves through this hook.

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { usePlatformStore } from '../store/usePlatformStore';

export interface ResolvedPackage {
  // The resolved package_id (e.g. "PKG-4D5B9DD9"), or null until packages load /
  // if no package context is selected. Studios should treat null as "not ready".
  packageId: string | null;
  // The full matched package object (has business_domain, package_name, etc.), or null.
  currentPackage: any | null;
  // The raw packages array — for studios that render a package <select> dropdown.
  packages: any[];
  // The raw query payload ({ packages: [...] }) — kept so call sites that previously
  // read `packagesData?.packages?.map(...)` keep working after the swap.
  packagesData: any;
  isLoading: boolean;
}

export function useResolvedPackageId(): ResolvedPackage {
  const activeProductContext = usePlatformStore((s) => s.activeProductContext);

  const { data: packagesData, isLoading } = useQuery({
    queryKey: ['product-packages'],
    queryFn: async () => (await apiClient.get('/masters/packages')).data,
    // No need to hit the API until a package context exists.
    enabled: !!activeProductContext,
  });

  const packages = packagesData?.packages ?? [];
  const currentPackage =
    packages.find((p: any) => p.package_name === activeProductContext) ?? null;

  return {
    packageId: currentPackage?.package_id ?? null,
    currentPackage,
    packages,
    packagesData,
    isLoading,
  };
}
