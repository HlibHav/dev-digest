/* hooks/ barrel — every React Query hook over the F1/feature APIs.
   Import from "@/lib/hooks" for the platform hooks (settings/repos/pulls/context)
   or from a domain file directly (e.g. "@/lib/hooks/reviews") — both resolve here. */
export * from "./core";
export * from "./agents";
// Named, not `export *`: the eight star-exports above predate the rule that
// forbids new ones (frontend-ui-architecture, rule 8).
export {
  useSkills,
  useSkill,
  useCreateSkill,
  useUpdateSkill,
  useDeleteSkill,
  usePreviewSkillImport,
  type CreateSkillInput,
  type UpdateSkillInput,
  type SkillImportPreview,
  type SkippedEntry,
} from "./skills";
export * from "./reviews";
export * from "./trace";
export * from "./repo-intel";
