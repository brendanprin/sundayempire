export type OwnerRow = {
  id: string;
  name: string;
  email: string | null;
  teamCount: number;
};

export type TeamRow = {
  id: string;
  name: string;
  abbreviation: string | null;
  divisionLabel: string | null;
  owner: {
    id: string;
    name: string;
  } | null;
};

export type OwnerForm = {
  name: string;
  email: string;
};

export type TeamForm = {
  name: string;
  abbreviation: string;
  divisionLabel: string;
  ownerId: string;
};

export type FranchiseStatus = "unassigned" | "assigned" | "needs-reassignment";

export type AssignmentFlow = {
  teamId: string;
  mode: "assign" | "reassign";
  pendingOwnerId: string;
};

export const REMOVE_ASSIGNMENT = "__remove__";

export type OwnerSelectOption = { id: string; label: string; email?: string | null };
