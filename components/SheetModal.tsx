import { ReactNode } from 'react';
import { Modal, View, StyleSheet, Text, TouchableOpacity, Pressable } from 'react-native';
import { X } from 'lucide-react-native';
import { colors } from '@/lib/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
};

export function SheetModal({ visible, onClose, title, children }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <Pressable style={styles.overlay} onPress={onClose}>
      <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <X size={22} color={colors.neutral[400]} />
          </TouchableOpacity>
        </View>
        {children}
      </Pressable>
    </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: colors.neutral[900],
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: '90%',
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.neutral[700],
    alignSelf: 'center',
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: 'Inter-Bold',
    fontSize: 20,
    color: colors.neutral[0],
  },
});
