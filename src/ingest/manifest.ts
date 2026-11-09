import { z } from 'zod/v4';
import { VERSION_IDS } from '../domain/versions.ts';

const sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'a lowercase hex sha256');

const moduleEntry = z.object({
  version: z.enum(VERSION_IDS),
  /** The normalized module, relative to `data/theword/`. */
  file: z.string().min(1),
  sha256,
});

/** `data/theword/MANIFEST.json`: the vendored theWord modules and their checksums. */
export const manifestSchema = z
  .object({ modules: z.array(moduleEntry) })
  .refine((m) => VERSION_IDS.every((id) => m.modules.filter((e) => e.version === id).length === 1), {
    message: `the manifest must list each version exactly once: ${VERSION_IDS.join(', ')}`,
  });

export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestModule = Manifest['modules'][number];

/** Parses the manifest JSON text; throws with the zod issues when it does not match. */
export const parseManifest = (json: string): Manifest => manifestSchema.parse(JSON.parse(json));
