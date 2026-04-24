import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Typography } from '@/components/ui/Typography';
import { Colors } from '@/constants/Colors';
import { Strings } from '@/constants/Strings';
import { useAuth } from '@/ctx/AuthContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { readCache, writeCache } from '@/lib/cache';
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

const MODE_TIPS: Record<string, string> = {
  improv: 'Estructura tu idea: introducción → 2 puntos clave → cierre. Respira entre frases.',
  reading: 'Lee con ritmo natural. Marca pausas al final de cada oración para mejorar la dicción.',
  vocab: 'Inserta cada palabra de forma natural en una historia coherente, no como una lista.',
  interview: 'Usa la técnica STAR: Situación, Tarea, Acción, Resultado. Mantén respuestas de 60-90s.',
  debate: 'Empieza con tu tesis, da 2 argumentos sólidos y cierra con un llamado claro.',
};

export default function Practice() {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const { initialMode } = params;

  const [favorites, setFavorites] = useState<string[]>([]);
  const favKey = user?.id ? `echo:favorites:${user.id}` : null;

  const [mode, setMode] = useState((initialMode as string) || 'improv');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [customTopicText, setCustomTopicText] = useState('');
  const [debateStance, setDebateStance] = useState<'FOR' | 'AGAINST'>('FOR');

  const filteredData = (() => {
    const term = modalSearch.trim().toLowerCase();
    const matched = !term
      ? data
      : data.filter((it) => {
          const hay = `${it.title || ''} ${it.content || ''} ${it.description || ''}`.toLowerCase();
          return hay.includes(term);
        });
    return [...matched].sort((a, b) => {
      const af = favorites.includes(a.id) ? 0 : 1;
      const bf = favorites.includes(b.id) ? 0 : 1;
      return af - bf;
    });
  })();

  const isCustomItem = (item: any) => item && typeof item.id === 'string' && item.id.startsWith('custom-');

  useEffect(() => {
    if (initialMode && typeof initialMode === 'string') {
      setMode(initialMode);
    }
  }, [initialMode]);

  useEffect(() => {
    if (!favKey) return;
    readCache<string[]>(favKey).then((v) => {
      if (Array.isArray(v)) setFavorites(v);
    });
  }, [favKey]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (favKey) writeCache(favKey, next);
      return next;
    });
  };

  const isFavorite = (id: string) => favorites.includes(id);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const custom = isCustomItem(selectedItem);

    const params: any = {
      mode: mode,
      topicTitle: selectedItem.title,
    };
    if (!custom) {
      params.topicId = selectedItem.id;
    }

    if (mode === 'reading') {
      params.targetText = selectedItem.content;
    } else if (mode === 'vocab') {
      params.words = JSON.stringify(selectedItem.meta?.words || []);
      params.targetText = selectedItem.content;
    } else if (mode === 'interview') {
      params.targetText = selectedItem.content;
    } else if (mode === 'debate') {
      params.targetText = selectedItem.content;
      params.stance = debateStance;
    } else if (mode === 'improv' && custom) {
      params.targetText = selectedItem.title;
    }

    router.push({
      pathname: '/(tabs)/practice/session',
      params: params
    });
  };

  const applyCustomTopic = () => {
    const trimmed = customTopicText.trim();
    if (trimmed.length < 3) return;
    setSelectedItem({
      id: `custom-${Date.now()}`,
      title: trimmed,
      description: 'Tema personalizado',
    });
    setCustomTopicText('');
    setCustomModalVisible(false);
  };

  const renderSelectionItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={[styles.modalItem, { borderBottomColor: themeColors.border, flexDirection: 'row', alignItems: 'center', gap: 12 }]}
      onPress={() => {
        setSelectedItem(item);
        setModalVisible(false);
      }}
    >
      <View style={{ flex: 1 }}>
        <Typography variant="h4" weight="bold">{item.title}</Typography>
        <Typography variant="caption" color={themeColors.subtext}>
          {item.difficulty?.toUpperCase() || item.category || 'General'}
        </Typography>
      </View>
      <TouchableOpacity
        onPress={(e) => { e.stopPropagation?.(); toggleFavorite(item.id); }}
        accessibilityLabel={isFavorite(item.id) ? 'Quitar de favoritos' : 'Marcar como favorito'}
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={isFavorite(item.id) ? 'star' : 'star-outline'}
          size={22}
          color={isFavorite(item.id) ? '#F59E0B' : themeColors.subtext}
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderCardContent = () => {
    if (!selectedItem) return <Typography variant="body">No hay contenido disponible.</Typography>;

    switch (mode) {
      case 'vocab':
        const words = selectedItem.meta?.words || [];
        return (
          <>
            <Typography variant="h3" align="center" style={{ marginBottom: 16 }}>«{selectedItem.title}»</Typography>
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
            <Typography variant="h3" align="center" style={{ marginBottom: 16 }}>«{selectedItem.title}»</Typography>
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
            <Typography variant="h2" align="center" weight="bold">«{selectedItem.content}»</Typography>
          </>
        );
      case 'reading':
        return (
          <>
            <Typography variant="h3" align="center" style={{ marginBottom: 12 }}>«{selectedItem.title}»</Typography>
            <Typography variant="body" align="center" color={themeColors.subtext} numberOfLines={6}>
              {selectedItem.content}
            </Typography>
          </>
        );
      default: // Improv
        return (
          <>
            <Typography variant="h3" align="center" style={{ marginBottom: 12 }}>«{selectedItem.title}»</Typography>
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
            {MODE_TIPS[mode] && (
              <View style={[styles.tipCard, { backgroundColor: themeColors.secondary, borderColor: themeColors.primary + '40' }]}>
                <Ionicons name="bulb-outline" size={18} color={themeColors.primary} />
                <Typography variant="caption" color={themeColors.text} style={{ flex: 1, lineHeight: 18 }}>
                  {MODE_TIPS[mode]}
                </Typography>
              </View>
            )}

            <View style={[styles.topicCard, { backgroundColor: themeColors.inputBackground }]}>
              <View style={styles.cardHeader}>
                <Typography variant="label" color={themeColors.primary}>
                  SELECCIÓN
                </Typography>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  {selectedItem && !isCustomItem(selectedItem) && (
                    <TouchableOpacity
                      onPress={() => toggleFavorite(selectedItem.id)}
                      accessibilityLabel={isFavorite(selectedItem.id) ? 'Quitar de favoritos' : 'Marcar como favorito'}
                      accessibilityRole="button"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name={isFavorite(selectedItem.id) ? 'star' : 'star-outline'}
                        size={20}
                        color={isFavorite(selectedItem.id) ? '#F59E0B' : themeColors.primary}
                      />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => setModalVisible(true)}>
                    <Typography variant="label" color={themeColors.primary}>
                      CAMBIAR
                    </Typography>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.cardBody}>
                {renderCardContent()}
              </View>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Aleatorio"
                    variant="ghost"
                    onPress={getNewRandom}
                    icon={<Ionicons name="shuffle" size={20} color={themeColors.primary} />}
                  />
                </View>
                {mode === 'improv' && (
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Mi tema"
                      variant="ghost"
                      onPress={() => setCustomModalVisible(true)}
                      icon={<Ionicons name="create-outline" size={20} color={themeColors.primary} />}
                    />
                  </View>
                )}
              </View>
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
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                accessibilityLabel="Cerrar"
                accessibilityRole="button"
              >
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>
            <Input
              placeholder="Buscar..."
              value={modalSearch}
              onChangeText={setModalSearch}
              autoCapitalize="none"
            />
            <Typography variant="caption" color={themeColors.subtext} style={{ marginBottom: 4 }}>
              {filteredData.length} de {data.length}
            </Typography>
            <FlatList
              data={filteredData}
              renderItem={renderSelectionItem}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={
                <Typography variant="caption" color={themeColors.subtext} align="center" style={{ marginTop: 16 }}>
                  Sin resultados.
                </Typography>
              }
            />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={customModalVisible}
        onRequestClose={() => setCustomModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.background, height: 'auto', paddingBottom: 32 }]}>
            <View style={styles.modalHeader}>
              <Typography variant="h3">Tema personalizado</Typography>
              <TouchableOpacity onPress={() => setCustomModalVisible(false)}>
                <Ionicons name="close" size={24} color={themeColors.text} />
              </TouchableOpacity>
            </View>
            <Typography variant="caption" color={themeColors.subtext} style={{ marginBottom: 12 }}>
              Escribe el tema sobre el que quieres improvisar.
            </Typography>
            <Input
              placeholder="Ej. Por qué viajar nos cambia"
              value={customTopicText}
              onChangeText={setCustomTopicText}
              autoFocus
              maxLength={120}
            />
            <Button
              title="Usar este tema"
              onPress={applyCustomTopic}
              style={{ marginTop: 8 }}
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
  tipCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
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
