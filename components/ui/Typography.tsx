
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { StyleSheet, Text, TextProps } from 'react-native';

interface TypographyProps extends TextProps {
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'body' | 'caption' | 'label';
  color?: string;
  weight?: 'regular' | 'medium' | 'bold';
  align?: 'left' | 'center' | 'right';
  monospace?: boolean;
}

export function Typography({
  style,
  variant = 'body',
  color,
  weight = 'regular',
  align = 'left',
  monospace = false,
  ...rest
}: TypographyProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  const getVariantStyle = () => {
    switch (variant) {
      case 'h1': return styles.h1;
      case 'h2': return styles.h2;
      case 'h3': return styles.h3;
      case 'h4': return styles.h4;
      case 'caption': return styles.caption;
      case 'label': return styles.label;
      default: return styles.body;
    }
  };

  const getWeight = () => {
    switch (variant) {
      case 'h1': return '700';
      case 'h2': return '600';
      case 'h3': return '600';
      case 'h4': return '600';
      case 'label': return '600';
      default: return weight === 'bold' ? '700' : weight === 'medium' ? '500' : '400';
    }
  };

  return (
    <Text
      style={[
        getVariantStyle(),
        {
          color: color || themeColors.text,
          fontWeight: getWeight() as any,
          textAlign: align,
          fontFamily: monospace ? 'Courier' : undefined,
        },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 32, lineHeight: 40 },
  h2: { fontSize: 24, lineHeight: 32 },
  h3: { fontSize: 20, lineHeight: 28 },
  h4: { fontSize: 18, lineHeight: 24 },
  body: { fontSize: 16, lineHeight: 24 },
  label: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },
});
