export const REMEDIATION_STORAGE_KEY = "dynasty:compliance:remediation:v1";

export type RemediationStatus = "Assigned" | "In Progress" | "Pending review";

export type RemediationStep = {
  id: string;
  label: string;
  completed: boolean;
  completedAt: string | null;
};

export type RemediationRecord = {
  id: string;
  teamId: string;
  teamName: string;
  ruleCode: string;
  message: string;
  severity: "warning" | "error";
  dueAt: string;
  acknowledgedAt: string | null;
  status: RemediationStatus;
  steps: RemediationStep[];
  updatedAt: string;
};

export type RemediationMetadata = {
  acknowledgedAt: string | null;
  steps: RemediationStep[];
};

type ComplianceFindingInput = {
  ruleCode: string;
  severity: "warning" | "error";
  message: string;
};

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function remediationRecordId(input: {
  teamId: string;
  ruleCode: string;
  message: string;
}) {
  return `${input.teamId}:${input.ruleCode}:${normalizeText(input.message)}`;
}

export function remediationTemplateSteps(ruleCode: string) {
  if (ruleCode.startsWith("STARTER_") || ruleCode.startsWith("ROSTER_")) {
    return [
      "Review starter and bench alignment for legal slot usage.",
      "Apply lineup or roster move that resolves the finding.",
      "Re-run compliance and verify no new lineup violations were introduced.",
    ];
  }

  if (ruleCode.startsWith("IR_")) {
    return [
      "Move ineligible players out of IR slots.",
      "Restore legal IR capacity with valid injury statuses.",
      "Re-run compliance to confirm IR constraints are now satisfied.",
    ];
  }

  if (ruleCode.startsWith("CAP_")) {
    return [
      "Select cap relief action (cut, trade, or contract adjustment).",
      "Execute the cap relief transaction and verify cap totals.",
      "Re-run compliance to confirm cap findings are resolved.",
    ];
  }

  if (ruleCode.startsWith("CONTRACT_") || ruleCode.startsWith("FRANCHISE_")) {
    return [
      "Review contract or franchise-tag details tied to this finding.",
      "Coordinate commissioner-approved contract adjustments.",
      "Re-run compliance to confirm contract policy alignment.",
    ];
  }

  return [
    "Review policy details and select remediation action.",
    "Apply the required roster or contract change.",
    "Re-run compliance and confirm finding resolution.",
  ];
}

export function deriveRemediationStatus(
  record: Pick<RemediationRecord, "steps" | "acknowledgedAt">,
): RemediationStatus {
  const totalSteps = record.steps.length;
  const completedSteps = record.steps.filter((step) => step.completed).length;

  if (totalSteps > 0 && completedSteps === totalSteps && record.acknowledgedAt) {
    return "Pending review";
  }
  if (completedSteps > 0 || record.acknowledgedAt) {
    return "In Progress";
  }
  return "Assigned";
}

export function upsertTeamRemediationRecords(input: {
  existingRecords: RemediationRecord[];
  teamId: string;
  teamName: string;
  findings: ComplianceFindingInput[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const existingById = new Map(
    input.existingRecords
      .filter((record) => record.teamId === input.teamId)
      .map((record) => [record.id, record]),
  );

  const activeIds = new Set<string>();
  const upserted = input.findings.map((finding) => {
    const id = remediationRecordId({
      teamId: input.teamId,
      ruleCode: finding.ruleCode,
      message: finding.message,
    });
    activeIds.add(id);

    const existing = existingById.get(id);
    if (existing) {
      const nextRecord: RemediationRecord = {
        ...existing,
        teamName: input.teamName,
        ruleCode: finding.ruleCode,
        severity: finding.severity,
        message: finding.message,
        updatedAt: now.toISOString(),
      };
      nextRecord.status = deriveRemediationStatus(nextRecord);
      return nextRecord;
    }

    const dueOffsetHours = finding.severity === "error" ? 48 : 96;
    const steps = remediationTemplateSteps(finding.ruleCode).map((label, index) => ({
      id: `${id}:step:${index + 1}`,
      label,
      completed: false,
      completedAt: null,
    }));

    const created: RemediationRecord = {
      id,
      teamId: input.teamId,
      teamName: input.teamName,
      ruleCode: finding.ruleCode,
      message: finding.message,
      severity: finding.severity,
      dueAt: new Date(now.getTime() + dueOffsetHours * 3_600_000).toISOString(),
      acknowledgedAt: null,
      status: "Assigned",
      steps,
      updatedAt: now.toISOString(),
    };
    created.status = deriveRemediationStatus(created);
    return created;
  });

  const otherTeamRecords = input.existingRecords.filter((record) => record.teamId !== input.teamId);
  const historicalCurrentTeamRecords = input.existingRecords.filter(
    (record) => record.teamId === input.teamId && !activeIds.has(record.id),
  );
  return [
    ...otherTeamRecords,
    ...historicalCurrentTeamRecords,
    ...upserted.filter((record) => activeIds.has(record.id)),
  ];
}

export function buildDefaultRemediationMetadata(input: {
  id: string;
  ruleCode: string;
  now?: Date;
}): RemediationMetadata {
  return {
    acknowledgedAt: null,
    steps: remediationTemplateSteps(input.ruleCode).map((label, index) => ({
      id: `${input.id}:step:${index + 1}`,
      label,
      completed: false,
      completedAt: null,
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStep(
  fallbackRecordId: string,
  index: number,
  step: unknown,
  fallbackLabel: string,
): RemediationStep {
  if (!isRecord(step)) {
    return {
      id: `${fallbackRecordId}:step:${index + 1}`,
      label: fallbackLabel,
      completed: false,
      completedAt: null,
    };
  }

  return {
    id:
      typeof step.id === "string" && step.id.trim().length > 0
        ? step.id
        : `${fallbackRecordId}:step:${index + 1}`,
    label:
      typeof step.label === "string" && step.label.trim().length > 0
        ? step.label
        : fallbackLabel,
    completed: step.completed === true,
    completedAt:
      typeof step.completedAt === "string" && step.completedAt.trim().length > 0
        ? step.completedAt
        : null,
  };
}

export function normalizeRemediationMetadata(input: {
  id: string;
  ruleCode: string;
  metadata: unknown;
}): RemediationMetadata {
  const defaults = buildDefaultRemediationMetadata({
    id: input.id,
    ruleCode: input.ruleCode,
  });

  if (!isRecord(input.metadata)) {
    return defaults;
  }

  const acknowledgedAt =
    typeof input.metadata.acknowledgedAt === "string" && input.metadata.acknowledgedAt.trim().length > 0
      ? input.metadata.acknowledgedAt
      : null;

  const providedSteps = Array.isArray(input.metadata.steps) ? input.metadata.steps : [];
  const fallbackLabels = remediationTemplateSteps(input.ruleCode);
  const totalSteps = Math.max(providedSteps.length, fallbackLabels.length);
  const steps = Array.from({ length: totalSteps }, (_, index) =>
    normalizeStep(
      input.id,
      index,
      providedSteps[index],
      fallbackLabels[index] ?? `Complete remediation step ${index + 1}.`,
    ),
  );

  return {
    acknowledgedAt,
    steps,
  };
}

export function toRemediationRecord(input: {
  id: string;
  teamId: string;
  teamName: string;
  ruleCode: string;
  message: string;
  severity: "warning" | "error";
  dueAt: string;
  metadata: unknown;
  updatedAt: string;
}): RemediationRecord {
  const remediation = normalizeRemediationMetadata({
    id: input.id,
    ruleCode: input.ruleCode,
    metadata: input.metadata,
  });

  const record: RemediationRecord = {
    id: input.id,
    teamId: input.teamId,
    teamName: input.teamName,
    ruleCode: input.ruleCode,
    message: input.message,
    severity: input.severity,
    dueAt: input.dueAt,
    acknowledgedAt: remediation.acknowledgedAt,
    status: "Assigned",
    steps: remediation.steps,
    updatedAt: input.updatedAt,
  };
  record.status = deriveRemediationStatus(record);
  return record;
}
