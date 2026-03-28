import { RulesetEditableFields } from "@/types/rules";

export type FormState = Record<keyof RulesetEditableFields, string>;

export type RulesFieldGroup = {
  title: string;
  fields: Array<{
    key: keyof RulesetEditableFields;
    label: string;
    type?: "number" | "text";
  }>;
};
