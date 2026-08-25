/**
 * Season & Week Management Module for Leagues
 */

function getCurrentSeasonAndWeek() {
  const now = new Date();
  
  // Calculate ISO Week (e.g. 2026-W32)
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const year = d.getUTCFullYear();

  const weekIdentifier = `${year}-W${weekNo < 10 ? '0' + weekNo : weekNo}`;

  // Base Season calculation (Season = Month, e.g. August 2026 = Season 1)
  const baseYear = 2026;
  const baseMonth = 7; // August (0-indexed: 7)
  const monthDiff = (now.getFullYear() - baseYear) * 12 + (now.getMonth() - baseMonth);
  const seasonNumber = Math.max(1, monthDiff + 1);

  // Week number within current season (1..4)
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekInSeason = Math.min(4, Math.ceil((now.getDate() + firstDayOfMonth.getDay()) / 7));

  // Time remaining until next Monday 00:00:00 TSİ
  const nextMonday = new Date(now);
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  const remainingMs = Math.max(0, nextMonday.getTime() - now.getTime());

  return {
    season_number: seasonNumber,
    season_title: `Sezon ${seasonNumber}: Odak Dönemi`,
    week_number: weekNo,
    week_in_season: weekInSeason,
    week_identifier: weekIdentifier,
    remaining_ms: remainingMs,
    reset_day_info: 'Pazartesi 00:00 TSİ'
  };
}

module.exports = {
  getCurrentSeasonAndWeek
};
