export const formatDuration = (baseSeconds: number): string => {
  if (!Number.isFinite(baseSeconds) || baseSeconds < 0) return '—';
  const seconds = baseSeconds > 0 ? Math.max(1, Math.ceil(baseSeconds)) : 0;
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  if (seconds >= 86_400) return `${days}d ${hours}h ${minutes}m ${remainder}s`;
  if (seconds >= 3_600) return `${hours}h ${minutes}m ${remainder}s`;
  return `${minutes}m ${remainder}s`;
};
