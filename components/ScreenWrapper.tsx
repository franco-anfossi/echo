
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { KeyboardAvoidingView, Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ScreenWrapperProps {
  children: React.ReactNode;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  keyboardAvoiding?: boolean;
}

export function ScreenWrapper({ children, style, contentContainerStyle, keyboardAvoiding }: ScreenWrapperProps) {
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  const inner = (
    <View style={[styles.content, contentContainerStyle]}>
      {children}
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: themeColors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
        style
      ]}
    >
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          {inner}
        </KeyboardAvoidingView>
      ) : inner}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  }
});
