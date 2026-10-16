const KYIV_TZ = 'Europe/Kyiv';

const getKyivDate = (): Date => {
  const now = new Date();
  const kyivStr = now.toLocaleString('sv-SE', { timeZone: KYIV_TZ });
  return new Date(kyivStr);
};

const toKyivISO = (date: Date): string => {
  const kyivStr = date.toLocaleString('sv-SE', { timeZone: KYIV_TZ });
  return new Date(kyivStr).toISOString();
};

export const formatMoney = (amount: number): string => {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: KYIV_TZ,
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

export const currentMonthKey = (): string => monthKey(getKyivDate());

export const getMonthRange = (key: string): { start: string; end: string } => {
  const [y, m] = key.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return {
    start: toKyivISO(start),
    end: toKyivISO(end),
  };
};

export const defaultDateForMonth = (monthKeyStr: string): string => {
  const [y, m] = monthKeyStr.split('-').map(Number);
  const kyivNow = getKyivDate();
  const lastDay = new Date(y, m, 0).getDate();
  const day = (y === kyivNow.getFullYear() && m === kyivNow.getMonth() + 1) ? kyivNow.getDate() : lastDay;
  const d = new Date(y, m - 1, Math.min(day, lastDay));
  return toKyivISO(d).slice(0, 10);
};

export const generateMonthKeys = (count: number): string[] => {
  const keys: string[] = [];
  const now = getKyivDate();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }
  return keys;
};

export const toKyivISODate = (dateStr: string): string => {
  const d = new Date(dateStr);
  return toKyivISO(d);
};
