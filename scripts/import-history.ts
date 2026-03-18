/**
 * Import match history from Google Sheets CSV into Supabase.
 * Run: npx tsx scripts/import-history.ts
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://oevndthrzplttctfocwr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ldm5kdGhyenBsdHRjdGZvY3dyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4NTA1MjAsImV4cCI6MjA4OTQyNjUyMH0.MMTkREffJcYGzJTeef8qdOca-7fCHoUnecAw60gzM2s';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Map Russian names to player IDs
const NAME_TO_ID: Record<string, string> = {
  'Алёна': 'alena',
  'Вадим': 'vadim',
  'Влад': 'vlad',
  'Вова': 'vova',
  'Женя': 'zhenya',
  'Лена': 'lena',
  'Маша': 'masha',
  'Настя': 'nastya',
  'Никита': 'nikita',
  'Стася': 'stasya',
};

const RATING_COLUMNS = ['Алёна', 'Вадим', 'Влад', 'Вова', 'Женя', 'Лена', 'Маша', 'Настя', 'Никита', 'Стася'];

function parseCSV(content: string): string[][] {
  const lines = content.split('\n').filter(l => l.trim());
  return lines.map(line => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  });
}

function parseDate(dateStr: string): string {
  // "17.08.2025" → "2025-08-17"
  const [day, month, year] = dateStr.split('.');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

async function main() {
  const csv = readFileSync('history_raw.csv', 'utf-8');
  const rows = parseCSV(csv);
  const header = rows[0];

  // Find column indices
  const colIdx = (name: string) => header.indexOf(name);
  const iP1 = colIdx('Игрок1');
  const iP2 = colIdx('Игрок2');
  const iS1 = colIdx('О1');
  const iS2 = colIdx('О2');
  const iDate = colIdx('Дата');
  const iEloA = colIdx('EloA');
  const iEloB = colIdx('EloB');

  // Rating column indices
  const ratingColIndices = RATING_COLUMNS.map(name => ({
    name,
    id: NAME_TO_ID[name],
    idx: colIdx(name),
  }));

  const matches: any[] = [];
  const snapshots: any[] = [];
  let matchCounter: Record<string, number> = {};

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const player1Name = row[iP1];
    const player2Name = row[iP2];

    // Skip rows without players (like the initial rating row)
    if (!player1Name || !player2Name) continue;

    const date = parseDate(row[iDate]);
    const player1Id = NAME_TO_ID[player1Name];
    const player2Id = NAME_TO_ID[player2Name];

    if (!player1Id || !player2Id) {
      console.warn(`Unknown player: ${player1Name} or ${player2Name} at row ${i + 1}`);
      continue;
    }

    const score1 = parseInt(row[iS1]);
    const score2 = parseInt(row[iS2]);
    const eloA = parseFloat(row[iEloA]);
    const eloB = parseFloat(row[iEloB]);

    if (isNaN(score1) || isNaN(score2)) {
      console.warn(`Invalid scores at row ${i + 1}: ${row[iS1]}, ${row[iS2]}`);
      continue;
    }

    // Generate unique match ID
    const dateKey = date;
    matchCounter[dateKey] = (matchCounter[dateKey] || 0) + 1;
    const matchId = `${dateKey}-${String(matchCounter[dateKey]).padStart(3, '0')}`;

    // Calculate elo after from the rating columns in this row
    const ratingsAfter: Record<string, number> = {};
    for (const col of ratingColIndices) {
      const val = parseFloat(row[col.idx]);
      if (!isNaN(val) && val > 0) {
        ratingsAfter[col.id] = val;
      }
    }

    const eloAfterP1 = ratingsAfter[player1Id] ?? Math.round(eloA);
    const eloAfterP2 = ratingsAfter[player2Id] ?? Math.round(eloB);

    matches.push({
      id: matchId,
      date,
      player1_id: player1Id,
      player2_id: player2Id,
      score1,
      score2,
      elo_before_p1: Math.round(eloA),
      elo_before_p2: Math.round(eloB),
      elo_after_p1: eloAfterP1,
      elo_after_p2: eloAfterP2,
    });

    snapshots.push({
      date,
      match_id: matchId,
      ratings: ratingsAfter,
    });
  }

  console.log(`Parsed ${matches.length} matches`);

  // Clear existing data (snapshots first due to FK)
  console.log('Clearing existing data...');
  const { error: delSnap } = await supabase.from('rating_snapshots').delete().neq('id', 0);
  if (delSnap) console.error('Error clearing snapshots:', delSnap.message);

  const { error: delMatch } = await supabase.from('matches').delete().neq('id', '');
  if (delMatch) console.error('Error clearing matches:', delMatch.message);

  // Insert in batches of 50
  const BATCH = 50;

  console.log('Inserting matches...');
  for (let i = 0; i < matches.length; i += BATCH) {
    const batch = matches.slice(i, i + BATCH);
    const { error } = await supabase.from('matches').insert(batch);
    if (error) {
      console.error(`Error inserting matches batch ${i}-${i + batch.length}:`, error.message);
      // Try one by one to find the problematic row
      for (const m of batch) {
        const { error: e2 } = await supabase.from('matches').insert(m);
        if (e2) console.error(`  Failed match ${m.id}: ${e2.message}`);
      }
    }
    process.stdout.write(`\r  ${Math.min(i + BATCH, matches.length)}/${matches.length}`);
  }
  console.log('\n  Done.');

  console.log('Inserting rating snapshots...');
  for (let i = 0; i < snapshots.length; i += BATCH) {
    const batch = snapshots.slice(i, i + BATCH);
    const { error } = await supabase.from('rating_snapshots').insert(batch);
    if (error) {
      console.error(`Error inserting snapshots batch ${i}-${i + batch.length}:`, error.message);
    }
    process.stdout.write(`\r  ${Math.min(i + BATCH, snapshots.length)}/${snapshots.length}`);
  }
  console.log('\n  Done.');

  // Verify
  const { count: mCount } = await supabase.from('matches').select('*', { count: 'exact', head: true });
  const { count: sCount } = await supabase.from('rating_snapshots').select('*', { count: 'exact', head: true });
  console.log(`\nVerification: ${mCount} matches, ${sCount} snapshots in database`);
}

main().catch(console.error);
