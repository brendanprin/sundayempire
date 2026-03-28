"use client";

import Link from "next/link";
import { formatEnumLabel } from "@/lib/format-label";
import type { TradeAssetView } from "@/types/trade-workflow";

type TeamRef = {
  id: string;
  name: string;
  abbreviation?: string | null;
};

type SimpleTradeAsset = {
  id: string;
  assetType: "PLAYER" | "PICK";
  label: string;
  player?: {
    id: string;
    name?: string;
    position?: string;
  } | null;
  contract?: {
    status?: string;
    salary?: number;
  } | null;
  futurePick?: {
    seasonYear?: number;
    round?: number;
  } | null;
};

function AssetCard({ asset }: { asset: SimpleTradeAsset | TradeAssetView }) {
  const isPlayer = asset.assetType === "PLAYER";
  
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-3">
      <p className="font-medium text-slate-100">
        {isPlayer && asset.player ? (
          <Link href={`/players/${asset.player.id}`} className="hover:text-sky-300">
            {asset.label}
          </Link>
        ) : (
          asset.label
        )}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        {isPlayer
          ? `${formatEnumLabel(asset.contract?.status ?? "UNKNOWN")} · $${asset.contract?.salary ?? 0}`
          : `${asset.futurePick?.seasonYear ?? "-"} round ${asset.futurePick?.round ?? "-"}`}
      </p>
    </div>
  );
}

function TeamAssetColumn({ 
  team, 
  assets, 
  direction 
}: { 
  team: TeamRef; 
  assets: (SimpleTradeAsset | TradeAssetView)[]; 
  direction: "sends" | "receives";
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-slate-100">
          {team.name} {direction}
        </h4>
        <div className="rounded-full px-2 py-1 text-xs font-medium bg-slate-700/50 text-slate-300">
          {assets.length} asset{assets.length !== 1 ? 's' : ''}
        </div>
      </div>
      
      {assets.length > 0 ? (
        <div className="space-y-3">
          {assets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/30 px-3 py-6 text-center">
          <p className="text-sm text-slate-500">
            {direction === "sends" ? "No assets being sent" : "No assets being received"}
          </p>
        </div>
      )}
    </div>
  );
}

export function TradeProposalCanvas(props: {
  proposerTeam: TeamRef;
  counterpartyTeam: TeamRef;
  proposerAssets: (SimpleTradeAsset | TradeAssetView)[];
  counterpartyAssets: (SimpleTradeAsset | TradeAssetView)[];
  compact?: boolean;
  testId?: string;
}) {
  const totalAssets = props.proposerAssets.length + props.counterpartyAssets.length;
  
  return (
    <div 
      className="space-y-4" 
      data-testid={props.testId || "trade-proposal-canvas"}
    >
      {/* Proposal Header */}
      <div className={`flex flex-wrap items-center justify-between gap-4 ${props.compact ? 'pb-2' : 'pb-4'}`}>
        <div>
          <h3 className={`font-semibold text-slate-100 ${props.compact ? 'text-lg' : 'text-xl'}`}>
            Proposed Exchange
          </h3>
          <p className="text-sm text-slate-400">
            {props.proposerTeam.name} ↔ {props.counterpartyTeam.name}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-full px-3 py-1 text-xs font-medium bg-slate-700/50 border border-slate-600 text-slate-300">
            {totalAssets} total assets
          </div>
        </div>
      </div>

      {/* Exchange Canvas */}
      <div className={`grid gap-4 ${props.compact ? 'lg:grid-cols-2' : 'xl:grid-cols-2'}`}>
        <TeamAssetColumn 
          team={props.proposerTeam}
          assets={props.proposerAssets}
          direction="sends"
        />
        
        {/* Exchange Arrow (visible on larger screens) */}
        <div className="hidden xl:flex items-center justify-center absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="rounded-full bg-slate-800 border border-slate-600 p-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m0-4l-4-4" />
            </svg>
          </div>
        </div>
        
        <TeamAssetColumn 
          team={props.counterpartyTeam}
          assets={props.counterpartyAssets}
          direction="receives"  
        />
      </div>

      {/* Proposal Summary */}
      {totalAssets === 0 && (
        <div className="rounded-lg border border-dashed border-amber-700/50 bg-amber-950/20 px-4 py-6 text-center">
          <p className="text-sm text-amber-100 font-medium mb-2">
            No Trade Package Selected
          </p>
          <p className="text-xs text-amber-200/80">
            Select players and picks from both teams to build the proposed exchange.
          </p>
        </div>
      )}
    </div>
  );
}