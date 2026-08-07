'use client';

import {
  Award, Book, BookOpen, Building2, CalendarCheck, CircleCheck, Crown, Flame, Gem,
  GraduationCap, Headphones, Medal, Megaphone, Rocket, Server, Settings2, ShieldCheck,
  Sparkles, Swords, Target, Timer, TrendingUp, Trophy, Undo2, Users, Wallet, Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * Icon names are stored as strings in the database (badge.icon, department.icon)
 * so that adding a badge does not require a frontend change. Anything not in
 * this map falls back to Sparkles rather than crashing the page.
 */
const ICONS: Record<string, LucideIcon> = {
  Award, Book, BookOpen, Building2, CalendarCheck, CircleCheck, Crown, Flame, Gem,
  GraduationCap, Headphones, Medal, Megaphone, Rocket, Server, Settings2, ShieldCheck,
  Sparkles, Swords, Target, Timer, TrendingUp, Trophy, Undo2, Users, Wallet, Zap,
};

export function Icon({
  name,
  className,
  size = 16,
  strokeWidth = 2,
}: {
  name: string;
  className?: string;
  size?: number;
  strokeWidth?: number;
}) {
  const Cmp = ICONS[name] ?? Sparkles;
  return <Cmp className={className} size={size} strokeWidth={strokeWidth} aria-hidden />;
}

export { ICONS };
