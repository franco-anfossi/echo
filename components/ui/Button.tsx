
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Typography } from './Typography';

interface ButtonProps {
  onPress: () => void;
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  icon?: React.ReactNode;
  textColor?: string;
}

export function Button({
  onPress,
  title,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  icon,
  textColor,
}: ButtonProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  const getBackgroundColor = () => {
    if (disabled) return themeColors.border;
    switch (variant) {
      case 'primary': return themeColors.primary;
      case 'secondary': return themeColors.secondary;
      case 'outline': return 'transparent';
      case 'ghost': return 'transparent';
      default: return themeColors.primary;
    }
  };

  const getTextColor = () => {
    if (textColor) return textColor;
    if (disabled) return themeColors.subtext;
    switch (variant) {
      case 'primary': return '#FFFFFF';
      case 'secondary': return themeColors.primary;
      case 'outline': return themeColors.primary;
      case 'ghost': return themeColors.subtext;
      default: return '#FFFFFF';
    }
  };

  const getBorder = () => {
    if (variant === 'outline') return { borderWidth: 1, borderColor: themeColors.primary };
    return {};
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.container,
        { backgroundColor: getBackgroundColor() },
        getBorder(),
        style,
      ]}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} />
      ) : (
        <>
          {icon && <View style={{ marginRight: 8 }}>{icon}</View>}
          <Typography variant="label" weight="medium" style={{ color: getTextColor() }}>
            {title}
          </Typography>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    flexDirection: 'row',
  },
});
