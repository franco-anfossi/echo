const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const MIN_PASSWORD_LENGTH = 8;

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return 'Ingresa tu correo electrónico.';
  if (!EMAIL_REGEX.test(trimmed)) return 'El correo no parece válido.';
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Ingresa una contraseña.';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  return null;
}

export function validateFullName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Ingresa tu nombre.';
  if (trimmed.length < 2) return 'El nombre es demasiado corto.';
  if (trimmed.length > 80) return 'El nombre es demasiado largo.';
  return null;
}
