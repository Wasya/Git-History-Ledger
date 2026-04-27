/**
 * Groups an array of commit objects into a nested structure:
 * { [year]: { [monthLabel]: { [weekLabel]: { [dayLabel]: commit[] } } } }
 *
 * Keys are sorted newest-first at every level.
 */
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

export function groupCommits(commits) {
  const grouped = {};

  for (const commit of commits) {
    const raw = commit.commit_date || commit.created_at;
    const date = new Date(raw);
    if (isNaN(date)) continue;

    const year = date.getFullYear();
    const monthLabel = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const weekLabel = `Week ${getISOWeek(date)}`;
    const dayLabel = date.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][monthLabel]) grouped[year][monthLabel] = {};
    if (!grouped[year][monthLabel][weekLabel]) grouped[year][monthLabel][weekLabel] = {};
    if (!grouped[year][monthLabel][weekLabel][dayLabel]) {
      grouped[year][monthLabel][weekLabel][dayLabel] = [];
    }
    grouped[year][monthLabel][weekLabel][dayLabel].push(commit);
  }

  // Sort each level newest-first
  const sortDesc = (obj) =>
    Object.keys(obj)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .reduce((acc, k) => { acc[k] = obj[k]; return acc; }, {});

  const result = {};
  for (const year of Object.keys(grouped).sort((a, b) => b - a)) {
    result[year] = {};
    for (const month of Object.keys(grouped[year]).sort((a, b) => new Date(b) - new Date(a))) {
      result[year][month] = {};
      for (const week of Object.keys(grouped[year][month]).sort((a, b) => {
        const na = parseInt(a.replace('Week ', ''));
        const nb = parseInt(b.replace('Week ', ''));
        return nb - na;
      })) {
        result[year][month][week] = sortDesc(grouped[year][month][week]);
      }
    }
  }

  return result;
}
