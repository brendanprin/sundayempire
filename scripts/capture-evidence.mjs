import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseUrl =
  process.env.PLAYWRIGHT_BASE_URL ??
  process.env.BASE_URL ??
  `http://127.0.0.1:${process.env.PORT ?? 3000}`;

const evidenceSlug = process.env.EVIDENCE_SLUG ?? "current-review";
const evidenceTitle = process.env.EVIDENCE_TITLE ?? "Current Evidence Pack";
const includeOperatorReplacements = process.env.INCLUDE_OPERATOR_REPLACEMENTS !== "0";
const outputRoot = path.resolve(`artifacts/${evidenceSlug}/evidence`);
const screenshotDir = path.join(outputRoot, "screenshots");
const videoDir = path.join(outputRoot, "videos");

const COMMISSIONER_EMAIL = "commissioner@local.league";
const OWNER_EMAIL = "owner01@local.league";
const READ_ONLY_EMAIL = "readonly@local.league";

function csv(headers, row) {
  return [headers.join(","), row.join(",")].join("\n");
}

function alternateRosterStatus(status) {
  return status === "ACTIVE" ? "IR" : "ACTIVE";
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function resetOutput() {
  await fs.rm(outputRoot, { recursive: true, force: true });
  await ensureDir(screenshotDir);
  await ensureDir(videoDir);
}

async function requestJson(routePath, email, init = {}, leagueId = null) {
  const response = await fetch(`${baseUrl}${routePath}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-dynasty-user-email": email,
      ...(leagueId ? { "x-dynasty-league-id": leagueId } : {}),
      ...(init.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) {
    const message = payload?.error?.message ?? response.statusText;
    throw new Error(`${init.method ?? "GET"} ${routePath} failed: ${message}`);
  }

  return payload;
}

async function activateLeagueContext(email, leagueId) {
  await requestJson(
    "/api/league/context",
    email,
    {
      method: "POST",
      body: JSON.stringify({ leagueId }),
    },
    leagueId,
  );
}

async function getPrimaryLeagueId(email) {
  const payload = await requestJson("/api/leagues", email);
  const leagueId = payload.leagues?.[0]?.id ?? null;
  if (!leagueId) {
    throw new Error("No league was available for evidence capture.");
  }
  return leagueId;
}

async function getOwnerWorkspaceContext(leagueId) {
  const authPayload = await requestJson("/api/auth/me", OWNER_EMAIL, {}, leagueId);
  const teamId = authPayload.actor?.teamId ?? null;
  if (!teamId) {
    throw new Error("Owner actor did not include a teamId for evidence capture.");
  }

  const detailPayload = await requestJson(`/api/teams/${teamId}/detail`, OWNER_EMAIL, {}, leagueId);
  const playerId = detailPayload.detail?.contracts?.[0]?.player?.id ?? null;
  if (!playerId) {
    throw new Error("Owner team detail did not expose a player contract for evidence capture.");
  }

  return {
    teamId,
    playerId,
  };
}

function extractTradeFindingCodes(payload) {
  const findings = payload?.error?.context?.findings;
  if (!Array.isArray(findings)) {
    return new Set();
  }

  return new Set(
    findings
      .map((finding) => (typeof finding?.code === "string" ? finding.code : null))
      .filter(Boolean),
  );
}

async function ensureTradeProposalId(leagueId, ownerTeamId) {
  const homePayload = await requestJson("/api/trades/home", OWNER_EMAIL, {}, leagueId);
  const existing =
    homePayload.sections?.drafts?.[0]?.id ??
    homePayload.sections?.outgoing?.[0]?.id ??
    homePayload.sections?.requiresResponse?.[0]?.id ??
    homePayload.sections?.closed?.[0]?.id ??
    null;

  if (existing) {
    return existing;
  }

  const teamsPayload = await requestJson("/api/teams", COMMISSIONER_EMAIL, {}, leagueId);
  const teams = teamsPayload.teams ?? [];
  const counterparty = teams.find((team) => team.id !== ownerTeamId) ?? null;
  if (!counterparty) {
    throw new Error("At least two teams are required to seed a trade proposal for evidence capture.");
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const [rosterA, rosterB] = await Promise.all([
      requestJson(`/api/teams/${ownerTeamId}/roster`, OWNER_EMAIL, {}, leagueId),
      requestJson(`/api/teams/${counterparty.id}/roster`, OWNER_EMAIL, {}, leagueId),
    ]);

    const pickA = rosterA.picks.filter((pick) => !pick.isUsed).at(-(attempt + 1));
    const pickB = rosterB.picks.filter((pick) => !pick.isUsed).at(-(attempt + 1));

    if (!pickA || !pickB) {
      continue;
    }

    const response = await fetch(`${baseUrl}/api/trades/proposals`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-dynasty-user-email": OWNER_EMAIL,
        "x-dynasty-league-id": leagueId,
      },
      body: JSON.stringify({
        proposerTeamId: ownerTeamId,
        counterpartyTeamId: counterparty.id,
        proposerAssets: [{ assetType: "PICK", futurePickId: pickA.id }],
        counterpartyAssets: [{ assetType: "PICK", futurePickId: pickB.id }],
      }),
    });

    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.proposal?.id) {
      return payload.proposal.id;
    }

    const codes = extractTradeFindingCodes(payload);
    if (codes.has("TRADE_WINDOW_CLOSED")) {
      await requestJson(
        "/api/commissioner/season/phase",
        COMMISSIONER_EMAIL,
        {
          method: "POST",
          body: JSON.stringify({
            phase: "REGULAR_SEASON",
            reason: "Evidence capture trade seed",
          }),
        },
        leagueId,
      );
    }
  }

  throw new Error("Unable to create a trade proposal for evidence capture.");
}

async function loadSyncSmokeTarget(leagueId) {
  const teamsPayload = await requestJson("/api/teams", COMMISSIONER_EMAIL, {}, leagueId);

  for (const team of teamsPayload.teams ?? []) {
    const detailPayload = await requestJson(`/api/teams/${team.id}/detail`, COMMISSIONER_EMAIL, {}, leagueId);
    const rows = [
      ...(detailPayload.detail?.roster?.starters ?? []),
      ...(detailPayload.detail?.roster?.bench ?? []),
      ...(detailPayload.detail?.roster?.injuredReserve ?? []),
      ...(detailPayload.detail?.roster?.taxi ?? []),
    ];

    const row = rows.find((entry) => entry.assignment && entry.assignment.rosterStatus !== "RELEASED");
    const alternateTeam = (teamsPayload.teams ?? []).find((candidate) => candidate.id !== team.id);

    if (row && alternateTeam) {
      return {
        sourceTeam: team,
        alternateTeam,
        row,
      };
    }
  }

  throw new Error("Could not find a rostered player for sync evidence capture.");
}

async function ensureSyncIssueId(leagueId) {
  const queuePayload = await requestJson("/api/sync/issues?status=OPEN", COMMISSIONER_EMAIL, {}, leagueId);
  const existing = queuePayload.issues?.[0]?.id ?? null;
  if (existing) {
    return existing;
  }

  const target = await loadSyncSmokeTarget(leagueId);
  const hostReference =
    target.row.assignment?.hostPlatformReferenceId ?? `s13-sync-evidence-${Date.now()}`;

  const runPayload = await requestJson(
    "/api/sync/run",
    COMMISSIONER_EMAIL,
    {
      method: "POST",
      body: JSON.stringify({
        adapterKey: "csv-manual",
        sourceLabel: `Evidence Sync ${Date.now()}`,
        roster: {
          format: "csv",
          csv: csv(
            ["playerName", "position", "teamName", "rosterStatus", "hostPlatformReferenceId"],
            [
              target.row.player.name,
              target.row.player.position,
              target.alternateTeam.name,
              alternateRosterStatus(target.row.assignment?.rosterStatus ?? "ACTIVE"),
              `${hostReference}-status`,
            ],
          ),
        },
      }),
    },
    leagueId,
  );

  if ((runPayload.summary?.totalDetected ?? 0) < 1) {
    throw new Error("Sync evidence seed did not create a mismatch.");
  }

  const refreshedQueue = await requestJson("/api/sync/issues?status=OPEN", COMMISSIONER_EMAIL, {}, leagueId);
  const issueId =
    refreshedQueue.issues?.find((issue) => issue.job?.id === runPayload.job?.id)?.id ??
    refreshedQueue.issues?.[0]?.id ??
    null;

  if (!issueId) {
    throw new Error("No sync issue was available after seeding evidence data.");
  }

  return issueId;
}

async function captureScenario(page, manifest, scenario) {
  await page.goto(scenario.path, { waitUntil: "domcontentloaded" });
  await scenario.ready(page);
  await page.waitForTimeout(250);

  const relativePath = path.join("screenshots", `${scenario.name}.png`);
  const absolutePath = path.join(outputRoot, relativePath);
  await page.screenshot({ path: absolutePath, fullPage: true });

  manifest.screenshots.push({
    name: scenario.name,
    role: scenario.role,
    route: scenario.path,
    description: scenario.description,
    file: relativePath,
  });
}

async function finalizeVideo(manifest, context, page, name, role, routesCovered) {
  const video = page.video();
  await context.close();

  if (!video) {
    return;
  }

  const sourcePath = await video.path();
  const targetRelativePath = path.join("videos", `${name}.webm`);
  const targetPath = path.join(outputRoot, targetRelativePath);
  await fs.rename(sourcePath, targetPath).catch(async () => {
    await fs.copyFile(sourcePath, targetPath);
    await fs.rm(sourcePath, { force: true });
  });

  manifest.videos.push({
    name,
    role,
    file: targetRelativePath,
    routesCovered,
  });
}

async function writeManifest(manifest) {
  const manifestPath = path.join(outputRoot, "manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const indexLines = [
    `# ${evidenceTitle}`,
    "",
    `Generated at: ${manifest.generatedAt}`,
    `Base URL: ${manifest.baseUrl}`,
    "",
    "## Screenshots",
    "",
    ...manifest.screenshots.map(
      (item) =>
        `- \`${item.name}\` (${item.role}) -> \`${item.route}\` -> \`${item.file}\``,
    ),
    "",
    "## Videos",
    "",
    ...(manifest.videos.length > 0
      ? manifest.videos.map(
          (item) =>
            `- \`${item.name}\` (${item.role}) -> \`${item.file}\` covering ${item.routesCovered.join(", ")}`,
        )
      : ["- None captured."]),
    "",
    "## Skipped",
    "",
    ...(manifest.skipped.length > 0
      ? manifest.skipped.map((item) => `- ${item}`)
      : ["- None."]),
  ];

  await fs.writeFile(path.join(outputRoot, "index.md"), `${indexLines.join("\n")}\n`, "utf8");
}

async function main() {
  await resetOutput();

  const leagueId = await getPrimaryLeagueId(COMMISSIONER_EMAIL);
  await Promise.all([
    activateLeagueContext(COMMISSIONER_EMAIL, leagueId),
    activateLeagueContext(OWNER_EMAIL, leagueId),
    activateLeagueContext(READ_ONLY_EMAIL, leagueId),
  ]);

  const ownerContextIds = await getOwnerWorkspaceContext(leagueId);
  const tradeProposalId = await ensureTradeProposalId(leagueId, ownerContextIds.teamId);
  const syncIssueId = await ensureSyncIssueId(leagueId);

  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    outputRoot,
    screenshots: [],
    videos: [],
    skipped: [],
  };

  const browser = await chromium.launch({ headless: true });

  try {
    const ownerContext = await browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1440, height: 1100 },
      extraHTTPHeaders: {
        "x-dynasty-user-email": OWNER_EMAIL,
        "x-dynasty-league-id": leagueId,
      },
      recordVideo: {
        dir: videoDir,
        size: { width: 1440, height: 1100 },
      },
    });
    const ownerPage = await ownerContext.newPage();

    const ownerScenarios = [
      {
        name: "dashboard-manager",
        role: "owner",
        path: `/league/${leagueId}`,
        description: "Dashboard command-center hierarchy for a manager.",
        ready: (page) => page.getByTestId("league-landing-dashboard").waitFor(),
      },
      {
        name: "my-roster-cap-overview",
        role: "owner",
        path: `/teams/${ownerContextIds.teamId}`,
        description: "My Roster / Cap overview workspace.",
        ready: (page) => page.getByTestId("team-cap-detail").waitFor(),
      },
      {
        name: "my-roster-cap-contracts",
        role: "owner",
        path: `/teams/${ownerContextIds.teamId}#team-contracts`,
        description: "My Roster / Cap contracts tab.",
        ready: async (page) => {
          await page.getByRole("tab", { name: /^Contracts/ }).click();
          await page.getByTestId("team-contracts-section").waitFor();
        },
      },
      {
        name: "player-contract-detail-eligible",
        role: "owner",
        path: `/players/${ownerContextIds.playerId}`,
        description: "Player / Contract Detail with manager preview access.",
        ready: (page) => page.getByTestId("player-contract-detail").waitFor(),
      },
      {
        name: "rules-and-deadlines-manager",
        role: "owner",
        path: "/rules",
        description: "Rules & Deadlines manager-first view.",
        ready: (page) => page.getByTestId("rules-deadlines-view").waitFor(),
      },
      {
        name: "trades-home",
        role: "owner",
        path: "/trades",
        description: "Trades home with pending actions and proposals.",
        ready: (page) => page.getByTestId("trades-home").waitFor(),
      },
      {
        name: "trade-builder",
        role: "owner",
        path: `/trades/new?proposalId=${encodeURIComponent(tradeProposalId)}`,
        description: "Trade Builder composition and validation workspace.",
        ready: (page) => page.getByTestId("trade-builder").waitFor(),
      },
      {
        name: "trade-review",
        role: "owner",
        path: `/trades/${tradeProposalId}`,
        description: "Trade Review detail surface.",
        ready: (page) => page.getByTestId("trade-detail").waitFor(),
      },
      {
        name: "picks-and-draft-home",
        role: "owner",
        path: "/draft",
        description: "Picks & Draft home.",
        ready: (page) => page.getByTestId("draft-home-view").waitFor(),
      },
      {
        name: "rookie-draft-workspace",
        role: "owner",
        path: "/draft/rookie",
        description: "Rookie Draft workspace.",
        ready: (page) => page.getByTestId("rookie-draft-workspace").waitFor(),
      },
      {
        name: "veteran-auction-workspace",
        role: "owner",
        path: "/draft/veteran-auction",
        description: "Veteran Auction workspace.",
        ready: (page) => page.getByTestId("veteran-auction-workspace").waitFor(),
      },
      {
        name: "league-activity",
        role: "owner",
        path: "/activity",
        description: "League Activity feed.",
        ready: (page) => page.getByTestId("activity-feed").waitFor(),
      },
      {
        name: "settings-compatibility-links",
        role: "owner",
        path: "/settings",
        description: "Settings retained compatibility links surface.",
        ready: (page) => page.getByTestId("settings-page").waitFor(),
      },
    ];

    for (const scenario of ownerScenarios) {
      await captureScenario(ownerPage, manifest, scenario);
    }

    await finalizeVideo(
      manifest,
      ownerContext,
      ownerPage,
      "manager-walkthrough",
      "owner",
      ownerScenarios.map((scenario) => scenario.name),
    );

    const commissionerContext = await browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1440, height: 1100 },
      extraHTTPHeaders: {
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "x-dynasty-league-id": leagueId,
      },
      recordVideo: {
        dir: videoDir,
        size: { width: 1440, height: 1100 },
      },
    });
    const commissionerPage = await commissionerContext.newPage();

    const commissionerScenarios = [
      {
        name: "sync-queue",
        role: "commissioner",
        path: `/league/${leagueId}/sync`,
        description: "Sync Queue commissioner operations view.",
        ready: (page) => page.getByTestId("sync-issues-queue-view").waitFor(),
      },
      {
        name: "sync-issue-detail",
        role: "commissioner",
        path: `/league/${leagueId}/sync/${syncIssueId}`,
        description: "Sync Issue Detail resolution surface.",
        ready: (page) => page.getByTestId("sync-issue-detail-view").waitFor(),
      },
      {
        name: "commissioner-operations",
        role: "commissioner",
        path: "/commissioner",
        description: "Commissioner Operations home.",
        ready: (page) => page.getByTestId("commissioner-priority-zone").waitFor(),
      },
      ...(includeOperatorReplacements
        ? [
            {
              name: "commissioner-contract-operations",
              role: "commissioner",
              path: "/commissioner#contract-operations",
              description: "Commissioner contract maintenance embedded in Commissioner Operations.",
              ready: async (page) => {
                const teamOpsZone = page.getByTestId("commissioner-team-ops-zone");
                await teamOpsZone.waitFor();
                const contractOps = page.getByTestId("commissioner-contract-operations");
                if ((await contractOps.count()) === 0) {
                  await page.getByTestId("commissioner-team-ops-zone-toggle").click();
                }
                await contractOps.waitFor();
              },
            },
            {
              name: "pick-ownership-operations",
              role: "commissioner",
              path: "/draft#pick-ownership-operations",
              description: "Commissioner pick ownership operations embedded in Picks & Draft.",
              ready: (page) => page.getByTestId("draft-pick-ownership-operations").waitFor(),
            },
          ]
        : []),
      {
        name: "commissioner-audit",
        role: "commissioner",
        path: "/commissioner/audit",
        description: "Commissioner Audit history view.",
        ready: (page) => page.getByTestId("commissioner-audit-feed").waitFor(),
      },
    ];

    for (const scenario of commissionerScenarios) {
      await captureScenario(commissionerPage, manifest, scenario);
    }

    await finalizeVideo(
      manifest,
      commissionerContext,
      commissionerPage,
      "commissioner-walkthrough",
      "commissioner",
      commissionerScenarios.map((scenario) => scenario.name),
    );

    const readOnlyContext = await browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1440, height: 1100 },
      extraHTTPHeaders: {
        "x-dynasty-user-email": READ_ONLY_EMAIL,
        "x-dynasty-league-id": leagueId,
      },
    });
    const readOnlyPage = await readOnlyContext.newPage();

    await captureScenario(readOnlyPage, manifest, {
      name: "player-contract-detail-blocked",
      role: "read-only",
      path: `/players/${ownerContextIds.playerId}`,
      description: "Player / Contract Detail with blocked preview actions.",
      ready: async (page) => {
        await page.getByTestId("player-contract-detail").waitFor();
        await page.getByText(
          "Cut previews are limited to commissioners and the owning manager.",
        ).waitFor();
      },
    });

    await readOnlyContext.close();

    await writeManifest(manifest);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
