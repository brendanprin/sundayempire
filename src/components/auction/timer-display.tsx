"use client";

import { useState, useEffect, useRef } from "react";

type TimerDisplayProps = {
  seconds: number | null;
  deadline?: string | null;
  size?: 'compact' | 'standard' | 'prominent';
  showUrgency?: boolean;
  label?: string;
  className?: string;
  concludedLabel?: string | null;
};

type TimeDisplay = {
  value: string;
  urgency: 'none' | 'moderate' | 'high' | 'critical' | 'ended';
  description: string;
  icon: string;
};

function calculateTimeDisplay(seconds: number | null, deadline?: string | null): TimeDisplay {
  // VA-S22: Always prioritize deadline when available for truthful live countdown
  if (deadline) {
    const now = new Date();
    const end = new Date(deadline);
    const diffMs = end.getTime() - now.getTime();
    seconds = diffMs <= 0 ? 0 : Math.floor(diffMs / 1000);
  }
  
  if (seconds === null) {
    return {
      value: '—',
      urgency: 'none',
      description: 'Timer not configured',
      icon: '⚪',
    };
  }
  
  if (seconds <= 0) {
    return {
      value: 'Concluded',
      urgency: 'ended',
      description: 'Auction period has ended',
      icon: '🔴',
    };
  }
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  let value: string;
  let urgency: TimeDisplay['urgency'];
  let description: string;
  let icon: string;
  
  // Format the time display with improved urgency semantics
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    value = `${days}d ${remainingHours}h`;
    urgency = 'none';
    description = `${days} day${days === 1 ? '' : 's'} remaining - plenty of time`;
    icon = '⏱️';
  } else if (hours >= 6) {
    value = `${hours}h ${minutes}m`;
    urgency = 'none';
    description = `${hours} hours remaining - monitor activity`;
    icon = '🕰️';
  } else if (hours >= 2) {
    value = `${hours}h ${minutes}m`;
    urgency = 'moderate';
    description = `${hours} hours remaining - increased activity expected`;
    icon = '⏰';
  } else if (minutes >= 30) {
    value = `${hours > 0 ? hours + 'h ' : ''}${minutes}m ${secs}s`;
    urgency = 'high';
    description = 'Approaching close - competitive pressure building';
    icon = '🧡';
  } else if (minutes >= 10) {
    value = `${minutes}m ${secs}s`;
    urgency = 'high';
    description = 'Close approaching - monitor and be ready to act';
    icon = '🟠';
  } else if (minutes >= 2) {
    value = `${minutes}m ${secs}s`;
    urgency = 'critical';
    description = 'FINAL MINUTES - immediate action required!';
    icon = '🔺';
  } else {
    value = `${secs}s`;
    urgency = 'critical';
    description = 'FINAL SECONDS - ACT NOW!';
    icon = '🚨';
  }
  
  return { value, urgency, description, icon };
}

function getUrgencyClasses(urgency: TimeDisplay['urgency'], size: TimerDisplayProps['size']) {
  const baseClasses = 'inline-flex items-center rounded-lg font-mono font-bold transition-all duration-300';
  
  const urgencyStyles = {
    none: 'text-slate-300 bg-slate-800/30 border border-slate-700/50 shadow-sm',
    moderate: 'text-slate-200 bg-slate-800/40 border border-slate-700/60 ring-1 ring-slate-600/20 shadow-md shadow-slate-500/10',
    high: 'text-orange-200 bg-orange-900/60 border border-orange-600/80 ring-2 ring-orange-500/40 shadow-xl shadow-orange-500/25',
    critical: 'text-red-200 bg-red-900/70 border border-red-600/90 ring-3 ring-red-500/50 animate-pulse shadow-2xl shadow-red-500/40',
    ended: 'text-slate-400 bg-slate-800/50 border border-slate-700/60 shadow-md',
  };
  
  const sizeStyles = {
    compact: 'px-2 py-1 text-xs',
    standard: 'px-3 py-1.5 text-sm',
    prominent: 'px-4 py-2.5 text-lg font-extrabold',
  };
  
  return `${baseClasses} ${urgencyStyles[urgency]} ${sizeStyles[size || 'standard']}`;
}

export function TimerDisplay({
  seconds,
  deadline,
  size = 'standard',
  showUrgency = true,
  label,
  className = '',
  concludedLabel,
}: TimerDisplayProps) {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  // VA-S16: Timer reset detection state
  const [showResetCue, setShowResetCue] = useState(false);
  const [lastDeadline, setLastDeadline] = useState<string | null>(deadline || null);
  const resetCueTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // VA-S16: Detect timer resets when deadline moves forward
  useEffect(() => {
    if (deadline && lastDeadline && deadline !== lastDeadline) {
      const newTime = new Date(deadline).getTime();
      const oldTime = new Date(lastDeadline).getTime();
      
      // Timer reset occurs when new deadline is later than previous deadline
      if (newTime > oldTime) {
        setShowResetCue(true);
        
        // Clear any existing timeout
        if (resetCueTimeoutRef.current) {
          clearTimeout(resetCueTimeoutRef.current);
        }
        
        // Hide reset cue after 3 seconds
        resetCueTimeoutRef.current = setTimeout(() => {
          setShowResetCue(false);
        }, 3000);
      }
    }
    
    setLastDeadline(deadline || null);
  }, [deadline, lastDeadline]);
  
  // Update current time every second for live countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => {
      clearInterval(interval);
      // Cleanup reset cue timeout
      if (resetCueTimeoutRef.current) {
        clearTimeout(resetCueTimeoutRef.current);
      }
    };
  }, []);
  
  // Recalculate display based on current time
  const timeDisplay = calculateTimeDisplay(seconds, deadline);
  
  const shouldShowPulse = timeDisplay.urgency === 'critical';
  const shouldEmphasize = timeDisplay.urgency === 'high' || timeDisplay.urgency === 'critical';
  
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && (
        <div className={`text-xs font-medium uppercase tracking-wide ${
          shouldEmphasize ? 'text-orange-300' : 'text-slate-400'
        }`}>
          {label}
        </div>
      )}
      
      <div className={getUrgencyClasses(timeDisplay.urgency, size)}>
        {showUrgency && (
          <span className={`mr-2 ${shouldShowPulse ? 'animate-bounce' : ''}`}>
            {timeDisplay.icon}
          </span>
        )}
        <span>{timeDisplay.value}</span>
        {shouldEmphasize && size !== 'compact' && (
          <span className="ml-2 text-xs opacity-75">⚡</span>
        )}
        {/* VA-S16: Timer reset visual cue */}
        {showResetCue && (
          <span className="ml-2 text-xs animate-pulse text-green-300">🔄</span>
        )}
      </div>
      
      {showUrgency && size !== 'compact' && (
        <p className={`text-xs ${
          shouldEmphasize ? 'text-orange-200 font-medium' : 'text-slate-400'
        }`}>
          {timeDisplay.urgency === 'ended' && concludedLabel
            ? concludedLabel
            : timeDisplay.description}
        </p>
      )}
      
      {/* VA-S16: Timer reset notification */}
      {showResetCue && size !== 'compact' && (
        <div className="text-xs bg-green-900/30 border border-green-700/40 rounded px-2 py-1 text-green-200 animate-pulse">
          <span className="font-medium flex items-center gap-1">
            <span>🔄</span>
            Timer Extended
          </span>
          <p className="mt-1 opacity-90">New bid received - auction time extended</p>
        </div>
      )}
      
      {/* Enhanced Operational Context for Urgent Timers */}
      {timeDisplay.urgency === 'critical' && size !== 'compact' && (
        <div className="text-xs bg-red-900/30 border-2 border-red-600/60 rounded-lg px-3 py-2 text-red-200 shadow-lg shadow-red-500/20">
          <span className="font-bold flex items-center gap-1">
            <span className="animate-bounce">🚨</span>
            URGENT ACTION REQUIRED
          </span>
          <p className="mt-1 font-medium">Auction closing imminently - submit final bids NOW!</p>
        </div>
      )}
      
      {/* Caution Context for High Urgency */}
      {timeDisplay.urgency === 'high' && size !== 'compact' && (
        <div className="text-xs bg-orange-900/20 border border-orange-700/40 rounded px-2 py-1 text-orange-200">
          <span className="font-medium flex items-center gap-1">
            <span>⚡</span>
            Competitive Pressure
          </span>
          <p className="mt-1 opacity-90">Monitor closely and be ready to act</p>
        </div>
      )}
    </div>
  );
}

export function TimeLeftBadge({ 
  seconds, 
  deadline,
  className = '',
  variant = 'standard'
}: { 
  seconds?: number | null;
  deadline?: string | null;
  className?: string;
  variant?: 'standard' | 'compact';
}) {
  const [currentTime, setCurrentTime] = useState(() => new Date());
  // VA-S16: Timer reset detection for badge
  const [showResetCue, setShowResetCue] = useState(false);
  const [lastDeadline, setLastDeadline] = useState<string | null>(deadline || null);
  const resetCueTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // VA-S16: Detect timer resets when deadline moves forward
  useEffect(() => {
    if (deadline && lastDeadline && deadline !== lastDeadline) {
      const newTime = new Date(deadline).getTime();
      const oldTime = new Date(lastDeadline).getTime();
      
      // Timer reset occurs when new deadline is later than previous deadline
      if (newTime > oldTime) {
        setShowResetCue(true);
        
        // Clear any existing timeout
        if (resetCueTimeoutRef.current) {
          clearTimeout(resetCueTimeoutRef.current);
        }
        
        // Hide reset cue after 2 seconds for badges
        resetCueTimeoutRef.current = setTimeout(() => {
          setShowResetCue(false);
        }, 2000);
      }
    }
    
    setLastDeadline(deadline || null);
  }, [deadline, lastDeadline]);
  
  // Update current time every second for live countdown when using deadline
  useEffect(() => {
    if (deadline) {
      const interval = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);
      
      return () => {
        clearInterval(interval);
        // Cleanup reset cue timeout
        if (resetCueTimeoutRef.current) {
          clearTimeout(resetCueTimeoutRef.current);
        }
      };
    }
  }, [deadline]);
  
  // Use deadline-based calculation if provided, otherwise fall back to seconds
  const timeDisplay = calculateTimeDisplay(seconds ?? null, deadline);
  
  if (timeDisplay.urgency === 'none' && seconds && seconds > 86400) { // > 1 day
    return (
      <span className={`text-xs text-slate-500 ${className}`}>
        {timeDisplay.value}
      </span>
    );
  }

  const baseClasses = variant === 'compact' 
    ? 'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium'
    : 'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium';
  
  return (
    <span
      className={`
        ${baseClasses}
        ${timeDisplay.urgency === 'critical' 
          ? 'bg-red-900/40 text-red-200 border border-red-700/50' 
          : timeDisplay.urgency === 'high'
          ? 'bg-orange-900/30 text-orange-200 border border-orange-700/50'
          : timeDisplay.urgency === 'ended'
          ? 'bg-gray-800/40 text-gray-400 border border-gray-700/50'
          : 'bg-slate-800/30 text-slate-300 border border-slate-700/50'
        }
        ${showResetCue ? 'ring-2 ring-green-500/50 bg-green-900/20' : ''}
        ${className}
      `}
    >
      {variant === 'standard' && <span className="mr-1">{timeDisplay.icon}</span>}
      {timeDisplay.value}
      {/* VA-S16: Timer reset indicator for badge */}
      {showResetCue && (
        <span className="ml-1 text-green-300 animate-pulse">🔄</span>
      )}
    </span>
  );
}