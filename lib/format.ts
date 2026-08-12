export const formatMoney = (amount: number): string => {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export const monthKey = (date: Date): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export const monthLabel = (key: string): string => {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
};

export const currentMonthKey = (): string => monthKey(new Date());

export const getMonthRange = (key: string): { start: string; end: string } => {
  const [y, m] = key.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
};

export const defaultDateForMonth = (monthKey: string): string => {
  const [y, m] = monthKey.split('-').map(Number);
  const now = new Date();
  const lastDay = new Date(y, m, 0).getDate();
  const day = (y === now.getFullYear() && m === now.getMonth() + 1) ? now.getDate() : lastDay;
  const d = new Date(y, m - 1, Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
};

export const generateMonthKeys = (count: number): string[] => {
  const keys: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }
  return keys;
};
