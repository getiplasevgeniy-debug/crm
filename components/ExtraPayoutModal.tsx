import { useEffect, useState } from 'react';
import { supabase, Manager } from '@/lib/supabase';
import { defaultDateForMonth, toKyivISODate } from '@/lib/format';
import { alertDialog } from '@/lib/confirm';
import { SheetModal } from '@/components/SheetModal';
import { LabeledInput } from '@/components/LabeledInput';
import { ActionButton } from '@/components/ActionButton';

type Props = {
  visible: boolean;
  manager: Manager | null;
  month: string;
  onClose: () => void;
  onSaved: () => void;
};

export function ExtraPayoutModal({ visible, manager, month, onClose, onSaved }: Props) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setAmount('');
      setNote('');
      setDate(defaultDateForMonth(month));
    }
  }, [visible, month]);

  const handleSave = async () => {
    if (!manager) return;
    const amt = parseFloat(amount.replace(',', '.'));
    if (!amt || amt <= 0) {
      alertDialog('Ошибка', 'Введите сумму больше 0');
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('salary_adjustments').insert({
      manager_id: manager.id,
      amount: amt,
      note: note.trim() || null,
      created_at: toKyivISODate(date),
    });
    setSaving(false);

    if (error) {
      alertDialog('Ошибка', error.message);
      return;
    }
    onSaved();
  };

  return (
    <SheetModal visible={visible} onClose={onClose} title={`Доп. выплата: ${manager?.name || ''}`}>
      <LabeledInput
        label="Сумма"
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
        keyboardType="numeric"
      />
      <LabeledInput label="Дата" value={date} onChangeText={setDate} datePicker />
      <LabeledInput
        label="Комментарий"
        value={note}
        onChangeText={setNote}
        placeholder="Например: премия за проект (необязательно)"
        multiline
      />
      <ActionButton label="Добавить к выплате" onPress={handleSave} loading={saving} />
    </SheetModal>
  );
}
