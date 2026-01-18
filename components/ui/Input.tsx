
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import { Typography } from './Typography';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
}

export function Input({ label, error, style, ...rest }: InputProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const themeColors = Colors[colorScheme];

  return (
    <View style={styles.container}>
      {label && (
        <Typography variant="label" style={styles.label}>
          {label}
        </Typography>
      )}
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: themeColors.surface,
            borderColor: error ? themeColors.error : themeColors.border,
            color: themeColors.text,
          },
          style,
        ]}
        placeholderTextColor={themeColors.subtext}
        {...rest}
      />
      {error && (
        <Typography variant="caption" style={{ color: themeColors.error, marginTop: 4 }}>
          {error}
        </Typography>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    width: '100%',
  },
  label: {
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
  },
});
