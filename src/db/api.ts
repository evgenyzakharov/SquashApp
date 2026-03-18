import { supabase } from './supabase';
import type { Player, Match, RatingSnapshot } from '../core/types';

// ─── Players ─────────────────────────────────────────────

export async function fetchPlayers(): Promise<Player[]> {
  const { data, error } = await supabase
    .from('players')
    .select('id, name')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function addPlayer(player: Player): Promise<void> {
  const { error } = await supabase.from('players').insert(player);
  if (error) throw error;
}

// ─── Matches ─────────────────────────────────────────────

export async function fetchMatches(): Promise<Match[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .order('date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapMatchRow);
}

export async function addMatch(match: Match): Promise<void> {
  const { error } = await supabase.from('matches').insert({
    id: match.id,
    date: match.date,
    player1_id: match.player1Id,
    player2_id: match.player2Id,
    score1: match.score1,
    score2: match.score2,
    elo_before_p1: match.eloBeforeP1,
    elo_before_p2: match.eloBeforeP2,
    elo_after_p1: match.eloAfterP1,
    elo_after_p2: match.eloAfterP2,
  });
  if (error) throw error;
}

// ─── Rating Snapshots ────────────────────────────────────

export async function fetchRatingSnapshots(): Promise<RatingSnapshot[]> {
  const { data, error } = await supabase
    .from('rating_snapshots')
    .select('date, match_id, ratings')
    .order('date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    date: row.date,
    matchId: row.match_id,
    ratings: row.ratings as Record<string, number>,
  }));
}

export async function addRatingSnapshot(snapshot: RatingSnapshot): Promise<void> {
  const { error } = await supabase.from('rating_snapshots').insert({
    date: snapshot.date,
    match_id: snapshot.matchId,
    ratings: snapshot.ratings,
  });
  if (error) throw error;
}

// ─── Helpers ─────────────────────────────────────────────

function mapMatchRow(row: Record<string, unknown>): Match {
  return {
    id: row.id as string,
    date: row.date as string,
    player1Id: row.player1_id as string,
    player2Id: row.player2_id as string,
    score1: row.score1 as number,
    score2: row.score2 as number,
    eloBeforeP1: row.elo_before_p1 as number,
    eloBeforeP2: row.elo_before_p2 as number,
    eloAfterP1: row.elo_after_p1 as number,
    eloAfterP2: row.elo_after_p2 as number,
  };
}
