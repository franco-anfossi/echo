import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Button } from '@/components/ui/Button';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { Strings } from '@/constants/Strings';
import { useColorScheme } from '@/hooks/useColorScheme';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

const MODES = [
  { id: 'improv', label: 'Improvisar', icon: 'mic-outline' },
  { id: 'reading', label: 'Lectura', icon: 'book-outline' },
  { id: 'vocab', label: 'Vocabulario', icon: 'extension-puzzle-outline' },
  { id: 'interview', label: 'Entrevista', icon: 'briefcase-outline' },
  { id: 'debate', label: 'Debate', icon: 'people-outline' },
];

export default function Practice() {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const router = useRouter();
  const params = useLocalSearchParams();
  const { initialMode } = params;

  const [mode, setMode] = useState((initialMode as string) || 'improv');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [debateStance, setDebateStance] = useState<'FOR' | 'AGAINST'>('FOR');

  useEffect(() => {
    if (initialMode && typeof initialMode === 'string') {
      setMode(initialMode);
    }
  }, [initialMode]);

  useEffect(() => {
    fetchData();
  }, [mode]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let fetchedData = [];

      if (mode === 'improv') {
        const { data: topics } = await supabase
          .from('topics')
          .select('*')
          .eq('active', true);
        fetchedData = topics || [];
      } else {
        const { data: prompts } = await supabase
          .from('practice_prompts')
          .select('*')
          .eq('type', mode)
          .eq('active', true);
        fetchedData = prompts || [];
      }

      setData(fetchedData);
      if (fetchedData.length > 0) {
        setSelectedItem(fetchedData[Math.floor(Math.random() * fetchedData.length)]);
      } else {
        setSelectedItem(null);
      }

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getNewRandom = () => {
    if (data.length > 0) {
      const random = data[Math.floor(Math.random() * data.length)];
      setSelectedItem(random);
    }
  };

  const handleStart = () => {
    if (!selectedItem) return;

    // Prepare params based on mode
    const params: any = {
      mode: mode,
      topicId: selectedItem.id, // ID reference
      topicTitle: selectedItem.title,
    };

    if (mode === 'reading') {
      params.targetText = selectedItem.content;
    } else if (mode === 'vocab') {
      params.words = JSON.stringify(selectedItem.meta?.words || []);
      params.targetText = selectedItem.content; // Instruction
    } else if (mode === 'interview') {
      params.targetText = selectedItem.content; // The Question
    } else if (mode === 'debate') {
      params.targetText = selectedItem.content; // The Statement
      params.stance = debateStance; // User selected stance
    }

    router.push({
      pathname: '/(tabs)/practice/session',
      params: params
    });
  };

  const renderSelectionItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.modalItem, { borderBottomColor: themeColors.border }]}
      onPress={() => {
        setSelectedItem(item);
        setModalVisible(false);
      }}
    >
      <Typography variant="h4" weight="bold">{item.title}</Typography>
      <Typography variant="caption" color={themeColors.subtext}>
        {item.difficulty?.toUpperCase() || item.category || 'General'}
      </Typography>
    </TouchableOpacity>
  );

  const renderCardContent = () => {
    if (!selectedItem) return <Typography variant="body">No hay contenido disponible.</Typography>;

    switch (mode) {
      case 'vocab':
        const words = selectedItem.meta?.words || [];
        return (
          <>
            <Typography variant="h3" align="center" style={{ marginBottom: 16 }}>"{selectedItem.title}"</Typography>
            <Typography variant="body" align="center" style={{ marginBottom: 24 }}>{selectedItem.content}</Typography>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {words.map((w: string, i: number) => (
                <View key={i} style={{ backgroundColor: themeColors.secondary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 }}>
                  <Typography variant="h4" color={themeColors.primary} weight="bold">{w}</Typography>
                </View>
              ))}
            </View>
          </>
        );
      case 'debate':
        const currentStance = debateStance || 'FOR';
        return (
          <>
            <Typography variant="h3" align="center" style={{ marginBottom: 16 }}>"{selectedItem.title}"</Typography>
            <Typography variant="h4" align="center" style={{ marginBottom: 24 }}>{selectedItem.content}</Typography>

            <View style={{ marginTop: 8, alignItems: 'center' }}>
              <TouchableOpacity
                style={{
                  backgroundColor: currentStance === 'FOR' ? themeColors.success + '20' : themeColors.error + '20',
                  borderColor: currentStance === 'FOR' ? themeColors.success : themeColors.error,
                  borderWidth: 2,
                  paddingHorizontal: 24,
                  paddingVertical: 12,
                  borderRadius: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8
                }}
                onPress={() => setDebateStance((prev) => prev === 'FOR' ? 'AGAINST' : 'FOR')}
              >
                <Ionicons name={currentStance === 'FOR' ? 'thumbs-up' : 'thumbs-down'} size={20} color={currentStance === 'FOR' ? themeColors.success : themeColors.error} />
                <Typography variant="h4" weight="bold" color={currentStance === 'FOR' ? themeColors.success : themeColors.error}>
                  {currentStance === 'FOR' ? 'A FAVOR' : 'EN CONTRA'}
                </Typography>
              </TouchableOpacity>
              <Typography variant="caption" color={themeColors.subtext} style={{ marginTop: 8, marginBottom: 12 }}>
                Toca para cambiar postura
              </Typography>
            </View>
          </>
        );
      case 'interview':
        return (
          <>
            <Typography variant="label" align="center" color={themeColors.subtext} style={{ marginBottom: 12 }}>PREGUNTA</Typography>
            <Typography variant="h2" align="center" weight="bold">"{selectedItem.content}"</Typography>
          </>
        );
      case 'reading':
        return (
          <>
            <Typography variant="h3" align="center" style={{ marginBottom: 12 }}>"{selectedItem.title}"</Typography>
            <Typography variant="body" align="center" color={themeColors.subtext} numberOfLines={6}>
              {selectedItem.content}
            </Typography>
          </>
        );
      default: // Improv
        return (
          <>
            <Typography variant="h3" align="center" style={{ marginBottom: 12 }}>"{selectedItem.title}"</Typography>
            <Typography variant="body" align="center" color={themeColors.subtext}>
              {selectedItem.description}
            </Typography>
          </>
        );
    }
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Typography variant="h2" weight="bold">
          {Strings.practice.title}
        </Typography>
      </View>

      {/* Mode Selector */}
      <View style={{ marginBottom: 24 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 20 }}>
          {MODES.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[
                styles.modeChip,
                mode === m.id ? { backgroundColor: themeColors.primary, borderColor: themeColors.primary } : { backgroundColor: themeColors.surface, borderColor: themeColors.border }
              ]}
              onPress={() => setMode(m.id)}
            >
              <Ionicons name={m.icon as any} size={18} color={mode === m.id ? '#FFF' : themeColors.subtext} />
              <Typography variant="caption" weight="bold" color={mode === m.id ? '#FFF' : themeColors.subtext} style={{ marginLeft: 6 }}>
                {m.label}
              </Typography>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="large" color={themeColors.primary} />
        ) : (
          <>
            <View style={[styles.topicCard, { backgroundColor: themeColors.inputBackground }]}>
              <View style={styles.cardHeader}>
                <Typography variant="label" color={themeColors.primary}>
                  SELECCIÓN
                </Typography>
                <TouchableOpacity onPress={() => setModalVisible(true)}>
                  <Typography variant="label" color={themeColors.primary}>
                    CAMBIAR
                  </Typography>
                </TouchableOpacity>
              </View>

              <View style={styles.cardBody}>
                {renderCardContent()}
              </View>

              <Button
                title="Aleatorio"
                variant="ghost"
                onPress={getNewRandom}
                icon={<Ionicons name="shuffle" size={20} color={themeColors.primary} />}
              />
            </View>

            <Button
              title="Comenzar Práctica"
              onPress={handleStart}
              style={styles.recordButton}
            />
          </>
        )}
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background }]}>
            <View style={styles.modalHeader}>
              <Typography variant="h3">Seleccionar</Typography>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={data}
              renderItem={renderSelectionItem}
              keyExtractor={(item) => item.id}
            />
          </View>
        </View>
      </Modal>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 20,
    marginTop: 16,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  content: {
    flex: 1,
  },
  topicCard: {
    padding: 24,
    borderRadius: 24,
    marginBottom: 40,
    minHeight: 280,
    justifyContent: 'space-between',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 24,
    alignItems: 'center'
  },
  cardBody: {
    justifyContent: 'center',
    marginBottom: 24,
    alignItems: 'center'
  },
  recordButton: {
    height: 56,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    height: '70%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalItem: {
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
