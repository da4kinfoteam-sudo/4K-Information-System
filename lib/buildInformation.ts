import type { BuildManifest, ReleaseCatalog } from './releaseMetadata';

declare const __FOURKIS_BUILD__: BuildManifest;
declare const __FOURKIS_RELEASES__: ReleaseCatalog;

export const loadedBuild: Readonly<BuildManifest> = Object.freeze(__FOURKIS_BUILD__);
export const bundledReleases: ReleaseCatalog = __FOURKIS_RELEASES__;
